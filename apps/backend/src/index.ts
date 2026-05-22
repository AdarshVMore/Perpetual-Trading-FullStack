// call all routes
// start server

import express from "express"

const app = express()
app.use(express.json())


app.listen(3000, ()=>{
    console.log("backend server has started on port 3001")
})