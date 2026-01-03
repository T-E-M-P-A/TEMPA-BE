const formatPathToUrl = (rawPath, BASE_URL) => {
  if (!rawPath) return null;

  let finalPath = rawPath;

  // Hapus '/' di awal jika ada
  if (finalPath.startsWith("/")) {
    finalPath = finalPath.substring(1);
  }
  // Hapus 'uploads/' di awal jika ada
  if (finalPath.startsWith("uploads/")) {
    finalPath = finalPath.substring("uploads/".length);
  }

  // Gabungkan dengan BASE_URL
  return `${BASE_URL}/public/${finalPath}`;
};

export default formatPathToUrl;
