package infra

import (
	"log"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

// RabbitMQ 封装了 AMQP 连接和 Channel，提供发布消息能力。
type RabbitMQ struct {
	url           string
	Conn          *amqp.Connection
	PubChannel    *amqp.Channel
	SubChannel    *amqp.Channel
	notifyConnClose chan *amqp.Error // 用于监听连接断开的 channel
}

// NewRabbitMQ 初始化并启动重连守护协程。首次连接失败时返回 error。
func NewRabbitMQ(url string) (*RabbitMQ, error) {
	rmq := &RabbitMQ{
		url: url,
	}
	// 1. 首次连接（失败立即返回 error）
	if err := rmq.connect(); err != nil {
		return nil, err
	}

	// 2. 开启后台协程，专门盯着连接状态
	go rmq.watchConnection()

	return rmq, nil
}

// connect 尝试建立一次连接，失败直接返回 error
func (r *RabbitMQ) connect() error {
	conn, err := amqp.Dial(r.url)
	if err != nil {
		return err
	}

	pubCh, err := conn.Channel()
	if err != nil {
		conn.Close()
		return err
	}

	subCh, err := conn.Channel()
	if err != nil {
		pubCh.Close()
		conn.Close()
		return err
	}

	r.Conn = conn
	r.PubChannel = pubCh
	r.SubChannel = subCh

	r.notifyConnClose = make(chan *amqp.Error, 1)
	r.Conn.NotifyClose(r.notifyConnClose)

	// 声明 ai_exchange（topic），幂等操作
	if err := r.declareTopology(); err != nil {
		subCh.Close()
		pubCh.Close()
		conn.Close()
		return err
	}

	log.Println("RabbitMQ 连接成功并已建立 Channels")
	return nil
}

// watchConnection 负责监听掉线事件并触发重连
func (r *RabbitMQ) watchConnection() {
	for {
		// 阻塞等待 NotifyClose 发来错误消息
		err, ok := <-r.notifyConnClose
		if !ok {
			log.Println("RabbitMQ 关闭信号 channel 已正常关闭，退出监听")
			return
		}

		log.Printf("RabbitMQ 连接断开: %v. 准备重连...", err)
		
		// 触发重连逻辑
		r.handleReconnect()
	}
}

// handleReconnect 包含具体的连接和 Channel 重建逻辑
func (r *RabbitMQ) handleReconnect() {
	for {
		log.Println("尝试连接 RabbitMQ...")
		conn, err := amqp.Dial(r.url)
		if err != nil {
			log.Printf("连接失败: %v. 3秒后重试...", err)
			time.Sleep(3 * time.Second)
			continue // 失败则死循环重试
		}

		// 连接成功后，建立收发分离的 Channel
		pubCh, err := conn.Channel()
		if err != nil {
			log.Printf("创建 Pub Channel 失败: %v", err)
			conn.Close()
			time.Sleep(3 * time.Second)
			continue
		}

		subCh, err := conn.Channel()
		if err != nil {
			log.Printf("创建 Sub Channel 失败: %v", err)
			pubCh.Close()
			conn.Close()
			time.Sleep(3 * time.Second)
			continue
		}

		// 将新的连接和 Channel 赋值给结构体
		r.Conn = conn
		r.PubChannel = pubCh
		r.SubChannel = subCh

		// 重新注册断线监听 Channel
		r.notifyConnClose = make(chan *amqp.Error, 1)
		r.Conn.NotifyClose(r.notifyConnClose)

		// 重连后重新声明拓扑
		if err := r.declareTopology(); err != nil {
			log.Printf("重连后声明拓扑失败: %v. 3秒后重试...", err)
			subCh.Close()
			pubCh.Close()
			conn.Close()
			time.Sleep(3 * time.Second)
			continue
		}

		log.Println("RabbitMQ 重连成功并已重建 Channels")
		break // 成功后跳出重试循环
	}
}

// declareTopology 声明 ai_exchange（topic 类型），幂等操作。
func (r *RabbitMQ) declareTopology() error {
	return r.PubChannel.ExchangeDeclare(
		"ai_exchange", // name
		"topic",       // kind
		true,          // durable
		false,         // autoDelete
		false,         // internal
		false,         // noWait
		nil,           // args
	)
}

// DeclareQueue 声明一个持久化队列（幂等操作）。
func (r *RabbitMQ) DeclareQueue(name string) (amqp.Queue, error) {
	return r.SubChannel.QueueDeclare(
		name,
		true,  // durable
		false, // autoDelete
		false, // exclusive
		false, // noWait
		nil,
	)
}

// Close 按序关闭 Channel 和 Connection。
func (r *RabbitMQ) Close() {
	if r.SubChannel != nil {
		_ = r.SubChannel.Close()
	}
	if r.PubChannel != nil {
		_ = r.PubChannel.Close()
	}
	if r.Conn != nil {
		_ = r.Conn.Close()
	}
}
