const { GoogleGenerativeAI } = require("@google/generative-ai");

const aiCtrl = {
  generateAIResponse: async (history, currentMessage) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return "I'm sorry, my Gemini API key is not configured. Please check the server settings.";
      }

      console.log(
        `🔑 Using key: ${apiKey.substring(0, 6)}...${apiKey.substring(
          apiKey.length - 4
        )}`
      );
      const genAI = new GoogleGenerativeAI(apiKey);

      // Model IDs - trying latest Gemini 2.5 Flash first for faster responses
      const modelsToTry = [
        "models/gemini-2.5-flash", // Latest! Fastest and most accurate
        "gemini-2.5-flash", // Without prefix fallback
        "models/gemini-2.0-flash", // Backup: Gemini 2.0
        "gemini-2.0-flash",
        "gemini-1.5-flash", // Legacy fallback
      ];

      console.log("🤖 Requesting Gemini (Simplified Mode)...");

      for (const modelId of modelsToTry) {
        try {
          console.log(`📡 Trying: ${modelId}`);
          const model = genAI.getGenerativeModel({ model: modelId });

          // Use simple generateContent (no chat history to avoid role errors)
          const result = await model.generateContent(currentMessage);
          const text = result.response.text();

          if (text) {
            console.log(`✅ SUCCESS with ${modelId}!`);
            return text;
          }
        } catch (err) {
          console.warn(`⚠️ ${modelId} failed: ${err.message}`);
          continue;
        }
      }

      return "I tried all available models but couldn't get a response. Please verify your API key has the Gemini API enabled in Google AI Studio.";
    } catch (err) {
      console.error("❌ Controller Error:", err.message);
      return "Something went wrong. Please try again.";
    }
  },
};

module.exports = aiCtrl;
