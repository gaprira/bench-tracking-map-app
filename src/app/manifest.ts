import type { MetadataRoute } from "next";

// Манифест веб-приложения: «Установить» в Chrome на Android и
// «На экран „Домой“» в Safari на iPhone открывают сайт как приложение
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Скамейки — карта и рецензии",
    short_name: "Скамейки",
    description: "Отмечайте скамейки на карте, оценивайте их и делитесь впечатлениями.",
    lang: "ru",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f0e6",
    theme_color: "#f4f0e6",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
