import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Нативный onnxruntime не бандлим — подключается из node_modules как есть
  serverExternalPackages: ["onnxruntime-node"],
  // Модель распознавания скамеек и нативный onnxruntime под Linux нужны функциям,
  // которые принимают фото. Путь к бинарнику onnxruntime вычисляется во время
  // работы, поэтому трассировка сама его не находит — указываем явно.
  outputFileTracingIncludes: {
    "/api/benches": [
      "./models/**",
      "./node_modules/onnxruntime-node/bin/napi-v*/linux/x64/**",
    ],
    "/api/check-photo": [
      "./models/**",
      "./node_modules/onnxruntime-node/bin/napi-v*/linux/x64/**",
    ],
  },
  // На Vercel нужен только linux/x64 — бинарники других платформ (~200 МБ) не берём
  outputFileTracingExcludes: {
    "*": [
      "node_modules/onnxruntime-node/bin/napi-v*/darwin/**",
      "node_modules/onnxruntime-node/bin/napi-v*/win32/**",
      "node_modules/onnxruntime-node/bin/napi-v*/linux/arm64/**",
    ],
  },
};

export default nextConfig;
