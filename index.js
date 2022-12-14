var express = require('express');
var http = require('http');
const cors = require('cors');
var path = require('path')
var app = express();
require('events').EventEmitter.defaultMaxListeners = 200;
const fs = require("fs");

const dotenv = require('dotenv')
dotenv.config();

const db = require('./db')
db.on('error', console.error.bind(console, 'MongoDB connection error:'))

const session = require('express-session')
const mongoDBStore = require('connect-mongodb-session')(session)
const store = new mongoDBStore({
    uri: process.env.DB_CONNECT,
    collection: 'sessions'
})

const cookieParser = require('cookie-parser')

app.use(cors({credentials: true, origin: true}));

app.use(express.urlencoded({extended: true}));
app.use(express.json());

app.use(cookieParser())

app.use(
  session({
      secret: "session key",
      resave: false,
      store: store,
      saveUninitialized: false,
      proxy:true,
      cookie: {
        httpOnly: true, 
        secure: false, 
        maxAge: 1000 * 60 * 60 * 48, 
        sameSite: false,
      }
  })
)
app.set('trust proxy', 1);

const auth = (req, res, next) => {
	res.setHeader('X-CSE356', '6306cc6d58d8bb3ef7f6b85b');
	if (req.session.user){
		next()
	}else{
		return res
			.status(200)
			.json({
				error: true,
				message: 'unauthorized'
			})
	}
}

const Y = require('yjs')
const { Client } = require('@elastic/elasticsearch');

var client = new Client({
    node: 'https://209.151.152.71:9200',
    auth: {
        username: 'elastic',
        password: "1idqXQYv97NwAFwO+08T"
    },
    tls: {
        ca: fs.readFileSync('/root/google-doc-ops/http_ca.crt'),
        rejectUnauthorized: false
    }
});

var docData = {}

app.get('/api/connect/:id', auth, (req, res) => {
    res.statusCode = 200;
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('X-CSE356', '6339f8feca6faf39d6089077');
    res.flushHeaders();
    
    let id = req.params.id;

    if (!docData.hasOwnProperty(id)){
        docData[id] = {
            clients: [],
            doc: new Y.Doc(),
            queue: []
        }
    }

	const newClient = {
		res: res,
		id: req.session.user,
		name: req.session.name,
		cursor: {
			index: null,
			length: null
		}
	}

    let newDoc = Array.from(Y.encodeStateAsUpdate(docData[id].doc))

    res.write(`id:${id}\ndata:${JSON.stringify({update: newDoc})}\nevent:sync\n\n`);
    docData[id].clients.push(newClient)
    docData[id].clients.forEach(client => {
        res.write(`id:${id}\ndata:${JSON.stringify({session_id: req.session.token, name: req.session.name, cursor: {index: client.cursor.index, length: client.cursor.length}, id: client.name})}\nevent:presence\n\n`);
    })

    docData[id].doc.on('update', (update) => {
        update = Array.from(update)
        docData[id].clients.forEach(client => {
            client.res.write(`id:${id}\ndata:${JSON.stringify({update: update})}\nevent:update\n\n`)
        });
    })

    req.on('close', () => {
        if (docData[id] && docData[id].clients){
            docData[id].clients = docData[id].clients.filter(client => client.id !== req.session.id);
        docData[id].clients.forEach(client => {
            client.res.write(`id:${id}\ndata:${JSON.stringify({session_id: req.session.token, name: req.session.name, cursor: {}, id: req.session.name})}\nevent:presence\n\n`);
        })
        }
        res.end()
    })
})

app.post('/api/op/:id', auth, (req, res) => {
	res.statusCode = 200;
	res.setHeader('Content-Type', 'application/json');
	res.setHeader('X-CSE356', '6339f8feca6faf39d6089077');

	let docId = req.params.id;
	const {update} = req.body;

    docData[docId].queue.push(new Uint8Array(update))

	res.json({
		status: 200
	})
})

updateQueue = async () => {
    let bulk = []
    for (const id in docData){
        if (docData.hasOwnProperty(id)) {
            if (docData[id].queue.length > 0){

                let update = Y.mergeUpdates(docData[id].queue)
                Y.applyUpdate(docData[id].doc, update)
                docData[id].queue = []

                let json = docData[id].doc.getText('quill').toJSON()
                bulk.push({
                    update: {
                        _id: id,
                        _index: 'yjs'
                    }
                })
                bulk.push({
                    doc: {
                        content: json
                    }
                })

                let words = json.match(/\b(\w+)\b/g)
                if(words){
                    words = words.map(word => word.toLowerCase())
                    words = [...new Set(words)];
                    words = words.filter(word => word.length > 6)
                    bulk.push({
                        update: {
                            _id: id,
                            _index: 'yjs-suggest'
                        }
                    })
                    bulk.push({
                        doc: {
                            suggest: words
                        }
                    })
                }
            }
        }
    }
    if (bulk.length > 0){
        client.bulk({ body: bulk });
    }
}

setInterval(updateQueue, 10000);

var server = http.createServer(app);

let port = 3000

server.listen(port, function(){
    console.log("server is running on port", port);
})