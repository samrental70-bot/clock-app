export default async function handler(req, res) {
  res.status(404).json({
    ok: false,
    app: "OPERA.AI",
    error: "Video rendering is not part of this OPERA.AI app.",
  });
}
