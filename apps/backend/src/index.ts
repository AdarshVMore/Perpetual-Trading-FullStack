import express from "express"
import orderRoutes from "./routes/orders"
import authRoutes from "./routes/auth"
import cors from "cors"

const app = express()

const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  process.env.FRONTEND_URL,
].filter((origin): origin is string => Boolean(origin)))

const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, origin ?? true)
    } else {
      callback(null, true)
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
}

app.use(cors(corsOptions))
app.options(/.*/, cors(corsOptions))

app.use((req, _res, next)=>{
  console.log(req.method, req.originalUrl)
  next()
})

app.use(express.json())

app.get("/", (_req, res) => {
  res.status(200).send("perp-api ok")
})
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" })
})

app.use("/api/v1/auth", authRoutes)
app.use("/api/v1/order", orderRoutes)

const PORT = Number(process.env.PORT ?? 3000)

app.listen(PORT, "0.0.0.0", ()=>{
    console.log(`backend server has started on port ${PORT}`)
})
