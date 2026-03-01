import fastq from "fastq";
import { createCertificate } from "./createCertificate.js";

const worker = async (task) => {
  try {
    console.log(`Processing: ${task.name}`);
    await createCertificate(task.name);
    return `Done: ${task.name}`;
  } catch (err) {
    console.error(`Processing Failed for ${task.name}:`, err);
    throw err; // Throw an error to let fastq know the process failed
  }
};

// Queue initialization (Concurrency: 2 means 2 certificates are processed at once)
const generateCertificateQueue = fastq.promise(worker, 2);

export default generateCertificateQueue;
