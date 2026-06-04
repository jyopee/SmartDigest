import axios from "axios";
import { API_BASE, API_TIMEOUT } from "./config";

const api = axios.create({
  baseURL: API_BASE,
  timeout: API_TIMEOUT,
  headers: {
    Accept: "application/json",
  },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) {
      return Promise.reject(
        new Error(
          "요청 시간이 초과되었습니다. 문서 요약은 수 분 걸릴 수 있습니다. 잠시 후 다시 시도하세요."
        )
      );
    }

    if (!error.response) {
      const isConnectionError =
        error.code === "ECONNREFUSED" ||
        error.code === "ECONNRESET" ||
        error.code === "ERR_NETWORK" ||
        /ECONNREFUSED|ECONNRESET|Network Error/i.test(error.message);

      if (isConnectionError) {
        return Promise.reject(
          new Error(
            "백엔드에 연결할 수 없습니다. " +
              "루트에서 npm run dev 로 백엔드(127.0.0.1:8000)를 실행했는지 확인하세요. " +
              `(baseURL: ${API_BASE || "Vite 프록시 /api"})`
          )
        );
      }
    }

    const data = error.response?.data;
    const detail = data?.detail;
    const message = Array.isArray(detail)
      ? detail.map((item) => item.msg || item).join(", ")
      : detail || data?.message || error.message || "요청에 실패했습니다.";
    return Promise.reject(new Error(message));
  }
);

export default api;
