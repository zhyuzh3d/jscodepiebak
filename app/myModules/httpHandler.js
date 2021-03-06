/*将http接口动态请求分发到httpApis文件夹注册的所有接口函数
将静态/web请求直接处理返回
*/
var lib = require('./lib.js').init();
var mod = {};

mod.apis = {};
mod.name = 'httpHandler';

/*每次模块更新都刷新app的控制函数*/
function updateSvr() {
    if (require('./app.js').svr) {
        require('./app.js').svr._events.request = handlerFn;
    };
};
updateSvr();

/*所有http请求的接口控制器,分发到app.httpApis[urlobj.pathname]*/
mod.handler = handlerFn;

function handlerFn(req, resp, nextfn) {
    req.urlObj = lib.url.parse(req.url);
    if (req.urlObj == undefined) {
        send404(req,resp,nextfn);
        if (nextfn) nextfn(req, resp);
        return;
    };

    //处理接口
    var urlpath = req.urlObj.pathname;
    if (urlpath.indexOf('/api/') == 0) {
        //动态Api接口
        var apifn = mod.apis[urlpath];
        if (apifn && apifn.constructor == Function) {
            try {
                apifn(req, resp, nextfn);
            } catch (err) {
                lib.logr.log(['httpHandler.handlerFn', 'Catch apifn err' + urlpath, err]);
            };
        } else {
            send404(req, resp, nextfn);
        };
    } else {
        //静态文件服务，对特殊目录重新定向
        switch (urlpath) {
        case '/':
            urlpath = '/index.html';
            break;
        case '/favicon.ico':
            urlpath = '/favicon.ico';
            break;
        default:
            break;
        };
        urlpath = 'web' + urlpath; //静态文件都是相对于web的路径,这里的路径不受当前目录影响
        req.webUrl = urlpath;

        //如果是首页,那么使用用户账号控制
        if (req.webUrl == 'web/index.html') {
            lib.usr.setUsrHeader(req, resp, function () {
                mod.webHandler(req, resp, nextfn);
            });
        } else {
            mod.webHandler(req, resp, nextfn);
        };
    };

    //写入日志
    var logobj = {
        url: req.url,
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
    };
    lib.logr.logf([undefined, undefined, logobj], 'web');
};

/*处理静态文件函数*/
mod.webHandler = webHandlerFn;
mod.fileCaches = {}; //全部web文件的缓存

function webHandlerFn(req, resp, nextfn) {
    var urlobj = req.urlObj;
    var fpath = req.webUrl;

    var ext = lib.path.extname(fpath);
    var mimetype = lib.mime[ext];

    //返回文件数据
    var ifnm = req.headers['if-none-match'] || 0;
    var fobj = mod.fileCaches[fpath];

    //如果服务端还没缓存，那么自动建立
    if (fobj == undefined) {
        fobj = mod.fileCaches[fpath] = loadFile(fpath);
    };

    //如果仍然失败返回404
    if (fobj == undefined) {
        send404(req, resp, nextfn);
        return;
    };

    //如果etag相同返回304，如果不同，返回200
    if (fobj.etag == ifnm) {
        send304(req, resp, nextfn);
    } else {
        var ifnm = req.headers['if-none-match'] || 0;
        //文件头写入Etag
        resp.setHeader('Content-Type', ext || 'text/plain');
        resp.setHeader('Etag', fobj.etag);
        resp.setHeader('Cache-Control', 'public,max-age=' + lib.cfg.webCacheSec);
        resp.writeHead(200);
        resp.end(fobj.data);
        if (nextfn) nextfn(req, resp);
    };
};

/*返回304信息*/
function send304(req, resp, nextfn) {
    resp.writeHead(304);
    resp.end();
    if (nextfn) nextfn(req, resp);
};

/*返回404错误页面模版*/
function send404(req, resp, nextfn) {
    var dat = lib.fs.readFileSync('web/404.html', 'utf-8');
    resp.writeHead(404, lib.mime['.html']);
    resp.end(dat);
    if (nextfn) nextfn(req, resp);
};

/*把一个文件读取为缓存模版{path:'',data:'',head:{etag:'','Content-Type':'','Cache-Control':''}}
etag为hash后得到的key
如果fpath不存在，返回undefined*/
function loadFile(fpath) {
    var fobj;
    //如果文件不存在，返回undefined
    if (lib.fs.existsSync(fpath)) {
        fobj = {};
        fobj.path = fpath;
        fobj.data = lib.fs.readFileSync(fpath);
        fobj.etag = lib.crypto.createHash('sha1').update(fobj.data).digest('base64');

        //自动监听文件改动，随时更新data和etag属性
        lib.fs.watch(fpath, function (event, fname) {
            //只在改变时候重新载入，rename或者error，delete等情况都不处理
            switch (event) {
            case 'change':
                fobj.data = lib.fs.readFileSync(fpath);
                fobj.etag = lib.crypto.createHash('sha1').update(fobj.data).digest('base64');
                break;
            default:
                lib.logr.log(['httpHandler.loadFile', 'Watch failed:' + fpath, event]);
                break;
            };
        })
    };
    return fobj;
};


/*导出*/
module.exports = mod;
