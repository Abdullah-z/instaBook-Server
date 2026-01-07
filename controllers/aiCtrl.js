const { GoogleGenerativeAI } = require("@google/generative-ai");

const aiCtrl = {
  generateAIResponse: async (history, currentMessage) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return "I'm sorry, my Gemini API key is not configured. Please check the server settings.";
      }

      const genAI = new GoogleGenerativeAI(apiKey);

      // Format history for @google/generative-ai
      const formattedHistory = history.map((msg) => ({
        role: msg.sender?.role === "ai_assistant" ? "model" : "user",
        parts: [{ text: msg.text }],
      }));

      console.log("🤖 Requesting Gemini response (Resilient Mode)...");

      // List of model IDs to try in order
      const modelsToTry = [
        "gemini-1.5-flash",
        "gemini-pro",
        "gemini-1.5-pro",
        "models/gemini-1.5-flash",
        "models/gemini-pro",
      ];

      for (const modelId of modelsToTry) {
        try {
          console.log(`📡 Attempting with model: ${modelId}...`);
          const model = genAI.getGenerativeModel({ model: modelId });
          const chat = model.startChat({
            history: formattedHistory,
          });

          const result = await chat.sendMessage(currentMessage);
          const response = await result.response;
          const text = response.text();

          if (text) {
            console.log(`✅ Success with ${modelId}`);
            return text;
          }
        } catch (apiErr) {
          console.warn(`⚠️ Model ${modelId} failed: ${apiErr.message}`);
          // If it's a 429 (Quota), we might want to stop entirely or wait,
          // but for now, let's keep trying other models.
          continue;
        }
      }

      return "I'm having a hard time finding a model that works with your API key right now. Please check your AI console!";
    } catch (err) {
      console.error("❌ Gemini SDK Error:", err.message);
      return "I'm having some trouble connecting to my brain. Please try again later.";
    }
  },
};

module.exports = aiCtrl;
