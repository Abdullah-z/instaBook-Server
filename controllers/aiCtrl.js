const { GoogleGenerativeAI } = require("@google/genai");

const aiCtrl = {
  generateAIResponse: async (history, currentMessage) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return "I'm sorry, my API key is not configured. Please check the server settings.";
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      // Format history for Gemini
      // Gemini history format: [{ role: "user", parts: [{ text: "hi" }] }, { role: "model", parts: [{ text: "hello" }] }]
      const formattedHistory = history.map((msg) => ({
        role: msg.sender.role === "ai_assistant" ? "model" : "user",
        parts: [{ text: msg.text }],
      }));

      const chat = model.startChat({
        history: formattedHistory,
        generationConfig: {
          maxOutputTokens: 1000,
        },
      });

      const result = await chat.sendMessage(currentMessage);
      const response = await result.response;
      return response.text();
    } catch (err) {
      console.error("Gemini AI Error:", err);
      return "I'm having trouble thinking right now. Please try again later.";
    }
  },
};

module.exports = aiCtrl;
