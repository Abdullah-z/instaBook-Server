const { GoogleGenerativeAI } = require("@google/genai");

const aiCtrl = {
  generateAIResponse: async (history, currentMessage) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return "I'm sorry, my API key is not configured. Please check the server settings.";
      }

      const { GoogleGenAI } = require("@google/genai");
      const ai = new GoogleGenAI({ apiKey });

      // Format history for @google/genai
      // It expects an array of { role: 'user' | 'model', contents: [{ text: string }] } or similar
      // Looking at frontend: contents is usually just the prompt.
      // For chat, let's use a combined prompt for now if startChat isn't standard in this SDK
      // Actually @google/genai is very new. Let's look at the frontend again.

      const prompt =
        history
          .map(
            (msg) =>
              `${msg.sender.role === "ai_assistant" ? "AI" : "User"}: ${
                msg.text
              }`
          )
          .join("\n") + `\nUser: ${currentMessage}\nAI:`;

      const result = await ai.models.generateContent({
        model: "gemini-2.0-flash-exp",
        contents: prompt,
      });

      return result.text;
    } catch (err) {
      console.error("Gemini AI Error:", err);
      return "I'm having trouble thinking right now. Please try again later.";
    }
  },
};

module.exports = aiCtrl;
