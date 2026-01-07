const { GoogleGenerativeAI } = require("@google/generative-ai");

const aiCtrl = {
  generateAIResponse: async (history, currentMessage) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return "I'm sorry, my Gemini API key is not configured. Please check the server settings.";
      }

      const genAI = new GoogleGenerativeAI(apiKey);

      // 1. Format history and FIX the "First role must be user" error
      let formattedHistory = history.map((msg) => ({
        role: msg.sender?.role === "ai_assistant" ? "model" : "user",
        parts: [{ text: msg.text || "" }],
      }));

      // Find the first index where role is 'user'
      const firstUserIndex = formattedHistory.findIndex(
        (h) => h.role === "user"
      );
      if (firstUserIndex === -1) {
        // No user messages in history yet, just send empty history
        formattedHistory = [];
      } else {
        // Start history from the first user message
        formattedHistory = formattedHistory.slice(firstUserIndex);
      }

      console.log("🤖 Requesting Gemini response (History fixed)...");

      // 2. Try multiple model IDs because some accounts/keys have 404 issues with specific names
      const modelsToTry = [
        "gemini-1.5-flash",
        "gemini-pro",
        "gemini-1.5-flash-8b",
        "gemini-1.5-pro",
      ];

      for (const modelId of modelsToTry) {
        try {
          console.log(`📡 Attempting with model: ${modelId}...`);
          const model = genAI.getGenerativeModel({ model: modelId });
          const chat = model.startChat({
            history: formattedHistory,
          });

          const result = await chat.sendMessage(currentMessage);
          const text = result.response.text();

          if (text) {
            console.log(`✅ Success with ${modelId}`);
            return text;
          }
        } catch (apiErr) {
          console.warn(`⚠️ Model ${modelId} failed: ${apiErr.message}`);
          // Continue to next model
          continue;
        }
      }

      return "I'm having a hard time finding a model that works with your key. Please check your AI Studio settings.";
    } catch (err) {
      console.error("❌ Gemini SDK Error:", err.message);
      return "I'm having some trouble connecting to my brain. Please try again later.";
    }
  },
};

module.exports = aiCtrl;
