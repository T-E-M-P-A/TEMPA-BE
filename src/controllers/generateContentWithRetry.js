import { GoogleGenAI } from "@google/genai"; // Pastikan impor ini ada di file Anda

const MAX_RETRIES = 3;

/**
 * Fungsi helper untuk memanggil Gemini API dengan logic retry (exponential backoff)
 * untuk menangani error 503.
 */
async function generateContentWithRetry(
  config,
  userProfile,
  systemInstruction,
) {
  const ai = new GoogleGenAI({});
  let currentRetry = 0;

  while (currentRetry < MAX_RETRIES) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: userProfile,
        config: {
          ...config, // Gabungkan konfigurasi lain (seperti responseMimeType dan responseSchema)
          systemInstruction: {
            parts: [{ text: systemInstruction }],
          },
        },
      });

      return response;
    } catch (error) {
      const isOverloadedError = error.message && error.message.includes("503");

      if (isOverloadedError && currentRetry < MAX_RETRIES - 1) {
        currentRetry++;
        // Hitung waktu tunggu: 2 detik, 4 detik, 8 detik (Exponential Backoff)
        const delay = Math.pow(2, currentRetry) * 1000;
        console.warn(
          `[RETRY] Model overloaded (503). Mencoba ulang ke-${currentRetry} dalam ${
            delay / 1000
          } detik...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
}

export default generateContentWithRetry;
