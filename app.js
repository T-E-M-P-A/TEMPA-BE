import express from "express";
import morgan from "morgan";

const app = express();
const port = 8080;

app.use(morgan('dev'))

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Listening on port ${port}...`);
});
