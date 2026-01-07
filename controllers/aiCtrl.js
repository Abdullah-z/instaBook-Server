const { GoogleGenerativeAI } = require("@google/generative-ai");

const aiCtrl = {
  generateAIResponse: async (history, currentMessage) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return "I'm sorry, my Gemini API key is not configured. Please check the server settings.";
      }

      // DEBUG: Log the first 4 chars of the key to verify it matches the new one from AI Studio
      console.log(
        `🔑 AI Bot is using key starting with: ${apiKey.substring(0, 4)}...`
      );

      const genAI = new GoogleGenerativeAI(apiKey);

      // 1. Format history and ensure it STARTS with a 'user' message
      let formattedHistory = history.map((msg) => ({
        role: msg.sender?.role === "ai_assistant" ? "model" : "user",
        parts: [{ text: msg.text || "" }],
      }));

      const firstUserIndex = formattedHistory.findIndex(
        (h) => h.role === "user"
      );
      if (firstUserIndex === -1) {
        formattedHistory = [];
      } else {
        formattedHistory = formattedHistory.slice(firstUserIndex);
      }

      console.log("🤖 Requesting Gemini response (Deep Resilient Mode)...");

      // 2. Wide variety of model IDs to bypass 404 errors
      const modelsToTry = [
        "gemini-1.5-flash-latest",
        "gemini-1.5-flash",
        "gemini-pro",
        "gemini-1.5-pro",
        "gemini-1.5-flash-001",
        "gemini-1.5-flash-002",
      ];

      for (const modelId of modelsToTry) {
        try {
          console.log(`📡 Trying model: ${modelId}...`);
          const model = genAI.getGenerativeModel({ model: modelId });
          const chat = model.startChat({
            history: formattedHistory,
          });

          const result = await chat.sendMessage(currentMessage);
          const response = await result.response;
          const text = response.text();

          if (text) {
            console.log(`✅ Success with ${modelId}!`);
            return text;
          }
        } catch (apiErr) {
          console.warn(`⚠️ ${modelId} failed: ${apiErr.message}`);
          continue;
        }
      }

      return "I'm still having trouble finding a model that works with your key. Please ensure the key matches your AI Studio screenshot and that the project has 'Gemini API' enabled.";
    } catch (err) {
      console.error("❌ Gemini Controller Error:", err.message);
      return "My brain is having a bit of a crisis. Please try again later.";
    }
  },
};

module.exports = aiCtrl;
