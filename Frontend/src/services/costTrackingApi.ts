/**
 * Cost Tracking API Service (Frontend)
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:5001/api' : '/api');

const costApi = {
  /**
   * Get current session cost summary
   */
  async getCurrentSession() {
    const token = localStorage.getItem('authToken');
    const resp = await fetch(`${API_BASE_URL}/user/costs/current`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    if (!resp.ok) throw new Error(`Failed to fetch current session: ${resp.status}`);
    const json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Failed to get current session');
    return json.data;
  },

  /**
   * Get all images with costs
   */
  async getImages() {
    const token = localStorage.getItem('authToken');
    const resp = await fetch(`${API_BASE_URL}/user/costs/images`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    if (!resp.ok) throw new Error(`Failed to fetch images: ${resp.status}`);
    const json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Failed to get images');
    return json.data;
  },

  /**
   * Get specific image details
   */
  async getImageCost(imageId: string) {
    const token = localStorage.getItem('authToken');
    const resp = await fetch(`${API_BASE_URL}/user/costs/image/${imageId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    if (!resp.ok) throw new Error(`Failed to fetch image cost: ${resp.status}`);
    const json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Failed to get image cost');
    return json.data;
  },

  /**
   * Get formatted cost summary
   */
  async getSummary() {
    const token = localStorage.getItem('authToken');
    const resp = await fetch(`${API_BASE_URL}/user/costs/summary`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    if (!resp.ok) throw new Error(`Failed to fetch summary: ${resp.status}`);
    const json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Failed to get summary');
    return json.data;
  },

  /**
   * Reset session
   */
  async resetSession() {
    const token = localStorage.getItem('authToken');
    const resp = await fetch(`${API_BASE_URL}/user/costs/reset`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    if (!resp.ok) throw new Error(`Failed to reset session: ${resp.status}`);
    const json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Failed to reset session');
    return json.data;
  },

  /**
   * Export session as JSON
   */
  async exportSession() {
    const token = localStorage.getItem('authToken');
    const resp = await fetch(`${API_BASE_URL}/user/costs/export`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (!resp.ok) throw new Error(`Failed to export session: ${resp.status}`);
    return await resp.text();
  }
};

export default costApi;
