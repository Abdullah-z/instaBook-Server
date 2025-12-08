const bcrypt = require("bcrypt");

// Change this value OR pass from command-line
const text = process.argv[2];

if (!text) {
  console.log("Usage: node hash.js <text_to_hash>");
  process.exit(1);
}

const saltRounds = 12;

bcrypt.hash(text, saltRounds, (err, hash) => {
  if (err) {
    console.error("Error hashing text:", err);
    return;
  }
  console.log("Input:", text);
  console.log("Hash:", hash);
});
