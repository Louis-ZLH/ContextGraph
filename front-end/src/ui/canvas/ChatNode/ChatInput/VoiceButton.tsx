import { useState, useRef, useEffect } from "react";
import { Mic } from "lucide-react";

function VoiceButton({ onTranscript }: { onTranscript: (text: string) => void }) {
  const [recording, setRecording] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const processedIndexRef = useRef(0);
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);

  const toggle = () => {
    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = true;

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      let newTranscript = "";
      for (let i = processedIndexRef.current; i < e.results.length; i++) {
        newTranscript += e.results[i][0].transcript;
      }
      processedIndexRef.current = e.results.length;
      if (newTranscript) {
        onTranscriptRef.current(newTranscript);
      }
    };
    recognition.onerror = () => setRecording(false);
    recognition.onend = () => setRecording(false);

    recognitionRef.current = recognition;
    processedIndexRef.current = 0;
    recognition.start();
    setRecording(true);
  };

  return (
    <button
      className={`p-1.5 rounded-full cursor-pointer transition-colors ${recording ? "animate-pulse" : "hover:bg-black/5"}`}
      style={recording ? { backgroundColor: "rgba(239,68,68,0.15)" } : undefined}
      title={recording ? "Stop recording" : "Voice input"}
      onClick={toggle}
    >
      <Mic size={16} style={{ color: recording ? "#ef4444" : "var(--text-primary)" }} />
    </button>
  );
}

export default VoiceButton;
