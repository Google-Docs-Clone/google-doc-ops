const mongoose = require('mongoose')
const dotenv = require('dotenv')
dotenv.config();
mongoose.set('strictQuery', false);
mongoose
    .connect(process.env.DB_CONNECT, { 
        useNewUrlParser: true
    })
    .then(() => {
        console.log('mongodb connected')
    })
    .catch(e => {
        console.error('Connection error', e.message)
    })

const db = mongoose.connection
module.exports = db
