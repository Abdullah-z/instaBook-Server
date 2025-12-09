const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const deleteImage = async (public_id) => {
  if (!public_id) return;

  if (!process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    console.warn("Cloudinary credentials missing. Skipping image deletion.");
    return;
  }

  try {
    const result = await cloudinary.uploader.destroy(public_id);
    console.log(`Cloudinary destroy result for ${public_id}:`, result);
  } catch (err) {
    console.error(`Failed to delete image ${public_id}:`, err);
  }
};

const deleteImageByUrl = async (url) => {
  if (!url) return;

  try {
    // Expected format: https://res.cloudinary.com/[cloud_name]/image/upload/v[version]/[public_id].[ext]
    // or just .../upload/[public_id].[ext]
    const regex = /\/upload\/(?:v\d+\/)?(.+)\./;
    const match = url.match(regex);

    if (match && match[1]) {
      await deleteImage(match[1]);
    } else {
      console.warn("Could not extract public_id from URL:", url);
    }
  } catch (err) {
    console.error("Error in deleteImageByUrl:", err);
  }
};

module.exports = { deleteImage, deleteImageByUrl };
