import axios from "axios";

const API_KEY = "my-secret-extension-key"; // In prod, use import.meta.env.VITE_INTERNAL_API_KEY
const BASE_URL = "http://127.0.0.1:3001/api";

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 300000, // 5 minutes for large uploads
  headers: {
    "x-api-key": API_KEY,
  },
});

export const apiService = {
  /**
   * Upload meeting data (Audio Blob + Transcript JSON)
   * @param {FormData} formData
   * @param {Function} onUploadProgress
   */
  uploadMeeting: async (formData, onUploadProgress) => {
    try {
      const response = await apiClient.post("/upload", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          if (onUploadProgress) onUploadProgress(percentCompleted);
        },
      });
      return response.data;
    } catch (error) {
      console.error("Upload API Error:", error);
      throw error;
    }
  },

  /**
   * Fetch all meeting history
   */
  fetchMeetings: async () => {
    const response = await apiClient.get("/meetings");
    return response.data;
  },

  /**
   * Delete a meeting
   */
  deleteMeeting: async (id) => {
    const response = await apiClient.delete(`/meetings/${id}`);
    return response.data;
  },
};
