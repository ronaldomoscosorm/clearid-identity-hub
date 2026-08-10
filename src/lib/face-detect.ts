// Detecção de rosto client-side (modelo leve BlazeFace via TensorFlow.js).
//
// Carregado SOB DEMANDA (import dinâmico) — não entra no bundle principal, só
// baixa quando a câmera abre. Se o carregamento falhar (offline, CSP, WebGL
// indisponível), `loadFaceDetector` resolve `null` e a UI degrada para a
// silhueta apenas como guia visual (sem indicador de pessoa).

export type FaceDetector = {
  /** Retorna true se há ao menos um rosto enquadrado no vídeo. */
  detect: (video: HTMLVideoElement) => Promise<boolean>;
};

let detectorPromise: Promise<FaceDetector | null> | null = null;

async function load(): Promise<FaceDetector | null> {
  try {
    const [tf, blazeface] = await Promise.all([
      import("@tensorflow/tfjs"),
      import("@tensorflow-models/blazeface"),
    ]);
    await tf.ready();
    const model = await blazeface.load();
    return {
      detect: async (video: HTMLVideoElement) => {
        if (!video || video.readyState < 2 || !video.videoWidth) return false;
        const preds = await model.estimateFaces(video, false);
        return preds.length > 0;
      },
    };
  } catch {
    return null;
  }
}

/** Carrega (uma vez) e retorna o detector, ou `null` se indisponível. */
export function loadFaceDetector(): Promise<FaceDetector | null> {
  if (!detectorPromise) detectorPromise = load();
  return detectorPromise;
}
