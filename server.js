var express = require("express");
var cookieParser = require("cookie-parser");
var app = express();

var path = require('path');
var bodyParser = require('body-parser'); 

app.use(express.static(__dirname + "/views"));
app.use(cookieParser());
app.set('views', path.join(__dirname + "/views"));
app.set('view engine', 'ejs');

app.get('/', function(req, res) {
    var b = req.cookies.currentUser;
	console.log("Cookies: ", b);
	console.log("true", b.length);
	if (req.cookies.currentUser === "'root'") {
		console.log("in welcome");
		res.render('welcome');
	} else {
		res.render('index');
	}
});


app.listen(8000, function(){
	console.log("app running at port 8000");
})