// call all routes
// start server

import express from "express"
import orderRoutes from "./routes/orders"
import authRoutes from "./routes/auth"

const app = express()
app.use(express.json())

app.use("/api/v1/auth", authRoutes)
app.use("/api/v1/order", orderRoutes)


app.listen(3000, ()=>{
    console.log("backend server has started on port 3001")
})