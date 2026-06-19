import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "30s", target: 20 },
    { duration: "1m", target: 20 },
    { duration: "10s", target: 0 },
  ],
};

const menteeIdArray = Array.from({ length: 100 }, (_, i) => i + 1);

export default function () {
  const url = "http://localhost:8080/api/v1/generate-certificate";

  const targetProgramId = 98;

  const payload = JSON.stringify({
    menteeId: menteeIdArray,
    idProgram: targetProgramId,
  });

  const params = {
    headers: {
      "Content-Type": "application/json",
      Authorization:
        "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJNIGFmaWZmdWRpbiBBbCBtYWhkaTI4IiwiZW1haWwiOiJtYWZpZmZ1ZGluMjhAZ21haWwuY29tIiwicm9sZSI6ImNhbXB1cyIsInZlcmlmIjp7InZlcmlmaWNhdGlvbl9zdGF0dXMiOiJhY2NlcHRlZCIsImNhbXB1c19uYW1lIjoiSU5TVElUVVQgVEVLTk9MT0dJIEJBVEFNIn0sImlhdCI6MTc4MTg1MDQ0NiwiZXhwIjoxNzgxOTM2ODQ2fQ.Zrg_dalW4ICPrPo5AB8UnBOq2bcvtzdyF71sNSmT-9g",
    },
  };

  const res = http.post(url, payload, params);

  // Pengecekan disesuaikan untuk respon endpoint sertifikat
  check(res, {
    "Status 200 (Berhasil diproses/masuk antrean)": (r) => r.status === 200,
    "Status 400 (Gagal validasi)": (r) => r.status === 400,
    "Status 500 (Error server)": (r) => r.status === 500,
    "Response time < 800ms": (r) => r.timings.duration < 800,
  });

  sleep(1);
}
