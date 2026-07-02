import express from "express"
import orderRoutes from "./routes/orders"
import authRoutes from "./routes/auth"
import cors from "cors"

const app = express()

app.use(cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use((req, _res, next)=>{
  console.log(req.method, req.originalUrl)
  next()
})

app.use(express.json())

app.use("/api/v1/auth", authRoutes)
app.use("/api/v1/order", orderRoutes)

app.listen(3000, ()=>{
    console.log("backend server has started on port 3000")
})
