import http from "k6/http";
import { check, sleep } from "k6";
import { randomIntBetween } from "https://jslib.k6.io/k6-utils/1.2.0/index.js";

export const options = {
  stages: [
    { duration: "30s", target: 20 },
    { duration: "1m", target: 20 },
    { duration: "10s", target: 0 },
  ],
};

export default function () {
  const randomMenteeId = randomIntBetween(6, 100);
  const url = `http://localhost:8080/api/v1/mentee/register-program/98/${randomMenteeId}`;

  const targetProgramId = 98;

  const payload = JSON.stringify({
    idMentee: randomMenteeId,
    idProgramInt: targetProgramId,
  });

  const params = {
    headers: {
      "Content-Type": "application/json",
      Authorization:
        "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJNIGFmaWZmdWRpbiBBbCBtYWhkaTI4IiwiZW1haWwiOiJtYWZpZmZ1ZGluMjhAZ21haWwuY29tIiwicm9sZSI6Im1lbnRlZSIsImlhdCI6MTc4MTE2NzUzNSwiZXhwIjoxNzgxMjUzOTM1fQ.Lv0kM21x16nMMay334F_YeKLU7ulPb9Tw8vz3mqT5JY",
    },
  };

  const res = http.post(url, payload, params);

  check(res, {
    "Status 200/201 (Berhasil)": (r) => r.status === 201 || r.status === 200,
    "Status 400 (Kuota Habis/Sudah Daftar)": (r) => r.status === 400,
    "Response time < 800ms": (r) => r.timings.duration < 800,
  });

  sleep(1);
}
