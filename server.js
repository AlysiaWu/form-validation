var express = require("express");
var app = express();

app.use(express.static(__dirname + "/"));

app.listen(8000, function(){
	console.log("app running at port 8000");
})