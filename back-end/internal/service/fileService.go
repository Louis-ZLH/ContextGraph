package service

import (
	"archive/zip"
	"bytes"
	"context"
	"fmt"
	"image"
	"image/jpeg"
	_ "image/gif"
	_ "image/png"
	"io"
	"log"
	"mime/multipart"
	"path/filepath"
	"strings"

	"github.com/luhao/contextGraph/internal/model"
	apperr "github.com/luhao/contextGraph/pkg/errors"
	"github.com/minio/minio-go/v7"
	pdfcpuapi "github.com/pdfcpu/pdfcpu/pkg/api"
	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
)

const (
	maxFileSize     = 5 << 20  // 5 MB
	maxTextFileSize = 50 << 10 // 50 KB
	maxPDFPages     = 3
	maxPPTSlides    = 5
	maxImageWidth   = 1568
	jpegQuality     = 80
)

// 允许的文件扩展名
var allowedExtensions = map[string]bool{
	".pdf":  true,
	".png":  true,
	".jpg":  true,
	".jpeg": true,
	".gif":  true,
	".webp": true,
	".svg":  true,
	".txt":  true,
	".md":   true,
	".docx": true,
	".xlsx": true,
	".pptx": true,
	".csv":  true,
	".json": true,
}

// 旧版 Office 格式扩展名（明确拒绝并提示用户转换）
var legacyOfficeExtensions = map[string]bool{
	".doc": true,
	".xls": true,
	".ppt": true,
}

// 允许的 MIME type 前缀
var allowedMIMEPrefixes = []string{
	"image/",
	"application/pdf",
	"text/",
	"application/vnd.openxmlformats",
	"application/json",
}

// 旧版 Office MIME types（明确拒绝）
var legacyOfficeMIMETypes = map[string]bool{
	"application/msword":             true, // .doc
	"application/vnd.ms-excel":       true, // .xls
	"application/vnd.ms-powerpoint":  true, // .ppt
}

type FileRepo interface {
	UploadToMinio(ctx context.Context, userID int64, file io.Reader, filename string, fileSize int64, contentType string) (string, error)
	CreateFileRecord(ctx context.Context, fileRecord *model.File) error
	GetFileByID(ctx context.Context, fileID int64) (*model.File, error)
	GetFileFromMinio(ctx context.Context, minioPath string) (*minio.Object, error)
	GetNodeWithCanvasUserID(ctx context.Context, nodeID string) (*model.Node, int64, error)
	UpdateNodeFileID(ctx context.Context, nodeID string, fileID *int64) error
	SetFileProcessingKeys(ctx context.Context, fileID int64) error
	PublishFileConvert(ctx context.Context, fileID int64, minioPath string, contentType string) error
}

type FileService struct {
	repo FileRepo
}

func NewFileService(repo FileRepo) *FileService {
	return &FileService{repo: repo}
}

func (s *FileService) UploadFile(ctx context.Context, userID int64, fileHeader *multipart.FileHeader) (int64, error) {
	// 1. 验证文件大小
	if fileHeader.Size > maxFileSize {
		return 0, apperr.BadRequest("文件大小超过限制（最大 5MB）")
	}
	if fileHeader.Size == 0 {
		return 0, apperr.BadRequest("文件不能为空")
	}

	// 2. 拒绝旧版 Office 格式
	ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
	if legacyOfficeExtensions[ext] {
		return 0, apperr.BadRequest("不支持旧版 Office 格式（.doc/.xls/.ppt），请转换为新版格式（.docx/.xlsx/.pptx）后重新上传")
	}

	// 3. 验证文件扩展名
	if ext == "" || !allowedExtensions[ext] {
		return 0, apperr.BadRequest("不支持的文件类型")
	}

	// 4. 验证 Content-Type（同时拒绝旧版 Office MIME type）
	contentType := fileHeader.Header.Get("Content-Type")
	if legacyOfficeMIMETypes[strings.ToLower(contentType)] {
		return 0, apperr.BadRequest("不支持旧版 Office 格式（.doc/.xls/.ppt），请转换为新版格式（.docx/.xlsx/.pptx）后重新上传")
	}
	if !isAllowedMIME(contentType) {
		return 0, apperr.BadRequest("不支持的文件 MIME 类型")
	}

	// 5. 打开文件
	file, err := fileHeader.Open()
	if err != nil {
		return 0, apperr.Wrap(err, 500, apperr.BizUnknown, "无法读取上传文件")
	}
	defer file.Close()

	var (
		uploadReader      io.Reader = file
		uploadSize        int64     = fileHeader.Size
		uploadContentType string    = contentType
	)

	// 6. 按类型进行额外校验和处理
	switch {
	case contentType == "application/pdf":
		// PDF：校验页数 ≤ 3
		pageCount, err := pdfcpuapi.PageCount(file, nil)
		if err != nil {
			return 0, apperr.BadRequest("无法解析 PDF 文件")
		}
		if pageCount > maxPDFPages {
			return 0, apperr.BadRequest(fmt.Sprintf("PDF 页数超过限制（最多 %d 页，当前 %d 页）", maxPDFPages, pageCount))
		}
		if _, err := file.Seek(0, io.SeekStart); err != nil {
			return 0, apperr.Wrap(err, 500, apperr.BizUnknown, "文件处理失败")
		}

	case isPPTContentType(contentType):
		// PPTX：校验页数 ≤ 5（通过 ZIP 结构计数 slide 数量）
		slideCount, err := countPPTXSlides(file, fileHeader.Size)
		if err == nil && slideCount > maxPPTSlides {
			return 0, apperr.BadRequest(fmt.Sprintf("PPT 页数超过限制（最多 %d 页，当前 %d 页）", maxPPTSlides, slideCount))
		}
		if _, err := file.Seek(0, io.SeekStart); err != nil {
			return 0, apperr.Wrap(err, 500, apperr.BizUnknown, "文件处理失败")
		}

	case isDocxContentType(contentType):
		// DOCX：通过 ZIP 读取 word/document.xml 估算文本量
		xmlSize, err := estimateZipEntrySize(file, fileHeader.Size, "word/document.xml")
		if err != nil {
			return 0, apperr.BadRequest("无法解析 DOCX 文件")
		}
		if xmlSize > maxTextFileSize {
			return 0, apperr.BadRequest("DOCX 文件文本内容过大（最大 50KB）")
		}
		if _, err := file.Seek(0, io.SeekStart); err != nil {
			return 0, apperr.Wrap(err, 500, apperr.BizUnknown, "文件处理失败")
		}

	case isXlsxContentType(contentType):
		// XLSX：通过 ZIP 读取 xl/sharedStrings.xml 估算文本量
		xmlSize, err := estimateZipEntrySize(file, fileHeader.Size, "xl/sharedStrings.xml")
		if err != nil {
			return 0, apperr.BadRequest("无法解析 XLSX 文件")
		}
		if xmlSize > maxTextFileSize {
			return 0, apperr.BadRequest("XLSX 文件文本内容过大（最大 50KB）")
		}
		if _, err := file.Seek(0, io.SeekStart); err != nil {
			return 0, apperr.Wrap(err, 500, apperr.BizUnknown, "文件处理失败")
		}

	case isTextContentType(contentType):
		// 文本类文件：校验大小 ≤ 50KB
		if fileHeader.Size > maxTextFileSize {
			return 0, apperr.BadRequest("文本文件内容过大（最大 50KB）")
		}

	case isCompressibleImage(contentType):
		// 图片：压缩后再存 MinIO
		data, err := compressImage(file)
		if err != nil {
			return 0, err
		}
		uploadReader = bytes.NewReader(data)
		uploadSize = int64(len(data))
		uploadContentType = "image/jpeg"
	}

	// 7. 上传到 MinIO
	minioPath, err := s.repo.UploadToMinio(ctx, userID, uploadReader, fileHeader.Filename, uploadSize, uploadContentType)
	if err != nil {
		return 0, err
	}

	// 8. 保存文件记录到数据库
	fileRecord := &model.File{
		UserID:      userID,
		MinioPath:   minioPath,
		Filename:    fileHeader.Filename,
		FileSize:    uploadSize,
		ContentType: uploadContentType,
	}
	if err := s.repo.CreateFileRecord(ctx, fileRecord); err != nil {
		return 0, err
	}

	// 9. 需要异步预处理的文件类型：SET Redis keys + Publish RabbitMQ
	if needsPreprocessing(uploadContentType) {
		if err := s.repo.SetFileProcessingKeys(ctx, fileRecord.ID); err != nil {
			log.Printf("[UploadFile] SetFileProcessingKeys failed for fileID=%d: %v", fileRecord.ID, err)
		}
		if err := s.repo.PublishFileConvert(ctx, fileRecord.ID, minioPath, uploadContentType); err != nil {
			log.Printf("[UploadFile] PublishFileConvert failed for fileID=%d: %v", fileRecord.ID, err)
		}
	}

	return fileRecord.ID, nil
}

// GetFileInfo 获取文件元信息（验证所有权）
func (s *FileService) GetFileInfo(ctx context.Context, userID int64, fileID int64) (*model.File, error) {
	file, err := s.repo.GetFileByID(ctx, fileID)
	if err != nil {
		return nil, err
	}
	if file.UserID != userID {
		return nil, apperr.Forbidden("无权访问该文件")
	}
	return file, nil
}

// DownloadFile 获取文件记录和文件流（验证所有权）
func (s *FileService) DownloadFile(ctx context.Context, userID int64, fileID int64) (*model.File, io.ReadCloser, error) {
	file, err := s.repo.GetFileByID(ctx, fileID)
	if err != nil {
		return nil, nil, err
	}
	if file.UserID != userID {
		return nil, nil, apperr.Forbidden("无权访问该文件")
	}

	obj, err := s.repo.GetFileFromMinio(ctx, file.MinioPath)
	if err != nil {
		return nil, nil, err
	}

	return file, obj, nil
}

// BindFileToNode 将文件绑定到节点
func (s *FileService) BindFileToNode(ctx context.Context, userID int64, fileID int64, nodeID string) error {
	// 1. 验证文件存在且属于当前用户
	file, err := s.repo.GetFileByID(ctx, fileID)
	if err != nil {
		return err
	}
	if file.UserID != userID {
		return apperr.Forbidden("无权操作该文件")
	}

	// 2. 验证节点存在且用户拥有其所属画布
	_, canvasUserID, err := s.repo.GetNodeWithCanvasUserID(ctx, nodeID)
	if err != nil {
		return err
	}
	if canvasUserID != userID {
		return apperr.Forbidden("无权操作该节点")
	}

	// 3. 更新节点的 file_id
	return s.repo.UpdateNodeFileID(ctx, nodeID, &fileID)
}

// compressImage 压缩图片：最大宽度 1568px，JPEG quality=80
func compressImage(r io.Reader) ([]byte, error) {
	img, _, err := image.Decode(r)
	if err != nil {
		return nil, apperr.BadRequest("无法解析图片文件")
	}

	bounds := img.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()

	// 如果宽度超过上限，等比缩放
	if width > maxImageWidth {
		newHeight := height * maxImageWidth / width
		dst := image.NewRGBA(image.Rect(0, 0, maxImageWidth, newHeight))
		draw.CatmullRom.Scale(dst, dst.Bounds(), img, bounds, draw.Over, nil)
		img = dst
	}

	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: jpegQuality}); err != nil {
		return nil, apperr.Wrap(err, 500, apperr.BizUnknown, "图片压缩失败")
	}

	return buf.Bytes(), nil
}

// isTextContentType 判断是否为文本类 Content-Type（text/* 或 application/json）
func isTextContentType(contentType string) bool {
	ct := strings.ToLower(contentType)
	return strings.HasPrefix(ct, "text/") || ct == "application/json"
}

// isCompressibleImage 判断是否为可压缩的图片类型（排除 SVG）
func isCompressibleImage(contentType string) bool {
	ct := strings.ToLower(contentType)
	return strings.HasPrefix(ct, "image/") && ct != "image/svg+xml"
}

// isDocxContentType 判断是否为 DOCX 类型
func isDocxContentType(contentType string) bool {
	return strings.ToLower(contentType) == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
}

// isXlsxContentType 判断是否为 XLSX 类型
func isXlsxContentType(contentType string) bool {
	return strings.ToLower(contentType) == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
}

// estimateZipEntrySize 读取 ZIP 中指定条目的未压缩大小，用于估算文本量
func estimateZipEntrySize(r io.ReaderAt, size int64, entryPath string) (uint64, error) {
	zr, err := zip.NewReader(r, size)
	if err != nil {
		return 0, err
	}
	for _, f := range zr.File {
		if f.Name == entryPath {
			return f.UncompressedSize64, nil
		}
	}
	return 0, nil // 条目不存在，无需拒绝
}

// isPPTContentType 判断是否为 PPTX 类型（旧版 .ppt 已在上传入口拒绝）
func isPPTContentType(contentType string) bool {
	return strings.ToLower(contentType) == "application/vnd.openxmlformats-officedocument.presentationml.presentation"
}

// countPPTXSlides 通过 ZIP 结构计算 PPTX 的 slide 数量
func countPPTXSlides(r io.ReaderAt, size int64) (int, error) {
	zr, err := zip.NewReader(r, size)
	if err != nil {
		return 0, err
	}

	count := 0
	for _, f := range zr.File {
		if strings.HasPrefix(f.Name, "ppt/slides/slide") && strings.HasSuffix(f.Name, ".xml") {
			count++
		}
	}
	return count, nil
}

// needsPreprocessing 判断文件是否需要异步预处理（PDF、DOCX、XLSX、PPTX）
func needsPreprocessing(contentType string) bool {
	ct := strings.ToLower(contentType)
	return ct == "application/pdf" ||
		isDocxContentType(ct) ||
		isXlsxContentType(ct) ||
		isPPTContentType(ct)
}

func isAllowedMIME(mime string) bool {
	mime = strings.ToLower(mime)
	for _, prefix := range allowedMIMEPrefixes {
		if strings.HasPrefix(mime, prefix) {
			return true
		}
	}
	return false
}
