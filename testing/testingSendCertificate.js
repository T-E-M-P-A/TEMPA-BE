import http from "k6/http";
import { check, sleep } from "k6";
import exec from "k6/execution"; // KUNCI PERBAIKAN: Import 'exec'

export const options = {
  vus: 1, // Saya sarankan naikkan VU agar rate-limit benar-benar terpicu
  iterations: 1000, // Total request tepat 100
};

export default function () {
  const url = "http://localhost:8080/api/v1/generate-certificate";

  const targetProgramId = 98;

  // PERBAIKAN: Gunakan exec.scenario.iterationInTest
  const currentMenteeId = exec.scenario.iterationInTest + 1;

  const payload = JSON.stringify({
    menteeId: [currentMenteeId],
    idProgram: targetProgramId,
  });

  const params = {
    headers: {
      "Content-Type": "application/json",
      Authorization:
        "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJNIGFmaWZmdWRpbiBBbCBtYWhkaTI4IiwiZW1haWwiOiJtYWZpZmZ1ZGluMjhAZ21haWwuY29tIiwicm9sZSI6ImNhbXB1cyIsInZlcmlmIjp7InZlcmlmaWNhdGlvbl9zdGF0dXMiOiJhY2NlcHRlZCIsImNhbXB1c19uYW1lIjoiSU5TVElUVVQgVEVLTk9MT0dJIEJBVEFNIn0sImlhdCI6MTc4MjIwNDU1MiwiZXhwIjoxNzgyMjkwOTUyfQ.Wtf9cefgoKmjT8a7_E_2QITuMnOTX54qejm9RNvkcqc",
    },
  };

  const res = http.post(url, payload, params);

  // Pengecekan disesuaikan untuk respon endpoint sertifikat
  check(res, {
    "Status 200 (Berhasil diproses/masuk antrean)": (r) => r.status === 200,
    "Status 400 (Gagal validasi)": (r) => r.status === 400,
    "Status 500 (Error server)": (r) => r.status === 500,
    "Temporary System Problem. IP temporarily blocked.": (r) =>
      r.status === 421,
    "Too many connections. Try again later.": (r) => r.status === 429,
    "Response time < 800ms": (r) => r.timings.duration < 800,
  });

  // Jeda dikurangi agar trafik lebih padat dan memicu error rate limit
  sleep(0.1);
}
