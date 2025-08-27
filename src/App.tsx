import React, { useEffect, useRef, useState } from "react";
import { SelfieSegmentation } from "@mediapipe/selfie_segmentation";

const App: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");

  // FPS state
  const [rawFps, setRawFps] = useState<number>(0);
  const [blurredFps, setBlurredFps] = useState<number>(0);

  useEffect(() => {
    // Get available cameras
    navigator.mediaDevices.enumerateDevices().then((mediaDevices) => {
      const cams = mediaDevices.filter((d) => d.kind === "videoinput");
      setDevices(cams);
      if (cams.length > 0) setSelectedDeviceId(cams[0].deviceId);
    });
  }, []);

  useEffect(() => {
    const selfieSegmentation = new SelfieSegmentation({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
    });
    selfieSegmentation.setOptions({ modelSelection: 1 });

    let animationFrameId: number;

    // FPS tracking vars
    let lastRawFrameTime = performance.now();
    let rawFrames = 0;
    let lastBlurredFrameTime = performance.now();
    let blurredFrames = 0;

    // Stop old stream if switching camera
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    // Start new stream
    navigator.mediaDevices
      .getUserMedia(
        selectedDeviceId
          ? { video: { deviceId: { exact: selectedDeviceId } } }
          : { video: true } // fallback to default camera
      )
      .then((stream) => {
        console.log("Camera stream started:", stream);
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }

        const render = async () => {
          if (videoRef.current) {
            // Count raw FPS
            rawFrames++;
            const now = performance.now();
            if (now - lastRawFrameTime >= 1000) {
              setRawFps(rawFrames);
              rawFrames = 0;
              lastRawFrameTime = now;
            }

            await selfieSegmentation.send({ image: videoRef.current });
          }
          animationFrameId = requestAnimationFrame(render);
        };
        render();
      })
      .catch((err) => {
        console.error("getUserMedia error:", err);
      });

    selfieSegmentation.onResults((results) => {
      if (!canvasRef.current || !videoRef.current) return;

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d")!;

      // Always match canvas internal resolution to video stream resolution
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;

      ctx.save();

      // --- Detect if front camera ---
      let isFront = false;
      const srcObj = videoRef.current.srcObject;

      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

      if (srcObj instanceof MediaStream) {
        const track = srcObj.getVideoTracks()[0];
        const settings = track.getSettings();

        if (isMobile && settings.facingMode === "user") {
          isFront = true; // only mirror on mobile front cams
        }
      }

      // ✅ Apply mirroring only if front cam detected
      if (isFront) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }

      // Draw mask first
      ctx.drawImage(
        results.segmentationMask,
        0,
        0,
        canvas.width,
        canvas.height
      );

      // Blur background
      ctx.globalCompositeOperation = "source-out";
      ctx.filter = "blur(15px)";
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

      // Draw person in front
      ctx.globalCompositeOperation = "destination-atop";
      ctx.filter = "none";
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

      ctx.restore();

      // Count blurred FPS
      blurredFrames++;
      const now = performance.now();
      if (now - lastBlurredFrameTime >= 1000) {
        setBlurredFps(blurredFrames);
        blurredFrames = 0;
        lastBlurredFrameTime = now;
      }
    });

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [selectedDeviceId]);

  return (
    <div style={{ padding: 16, fontFamily: "sans-serif", marginLeft: "30%" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
        Camera Blur Demo
      </h1>

      <select
        value={selectedDeviceId}
        onChange={(e) => setSelectedDeviceId(e.target.value)}
        style={{
          border: "1px solid #ccc",
          padding: 8,
          borderRadius: 6,
          marginBottom: 16,
        }}
      >
        {devices.map((d, i) => (
          <option key={i} value={d.deviceId}>
            {d.label || `Camera ${i + 1}`}
          </option>
        ))}
      </select>

      {/* Side-by-side layout */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          gap: 24,
          alignItems: "flex-start",
        }}
      >
        {/* Raw video + FPS */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <video
            ref={videoRef}
            playsInline
            autoPlay
            muted
            style={{
              width: "100%",
              maxWidth: 480,
              aspectRatio: "4 / 3", // keeps proportion
              border: "1px solid #ddd",
              borderRadius: 8,
              background: "#000",
              objectFit: "cover",
            }}
          />
          <p style={{ marginTop: 8, fontSize: 12, color: "#555" }}>
            Raw Video FPS: {rawFps}
          </p>
        </div>

        {/* Blurred canvas + FPS */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <canvas
            ref={canvasRef}
            style={{
              width: "100%",
              maxWidth: 480,
              aspectRatio: "4 / 3", // keeps proportion in sync
              border: "1px solid #ddd",
              borderRadius: 8,
              background: "#000",
            }}
          />
          <p style={{ marginTop: 8, fontSize: 12, color: "#555" }}>
            Blurred Video FPS: {blurredFps}
          </p>
        </div>
      </div>
    </div>
  );
};

export default App;
