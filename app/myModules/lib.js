/*所有require库的引用，所有reqire都应指向这里，以便于单个module重载刷新
动态载入自定义模块
本页函数不会自动重载*/

var mod = {};
var myModules; //所有modules文件夹下的自定义模块；

/*重载模块*/
mod.init = initFn;
mod.watchs = {
    paths: [],
    fns: {},
};

function initFn(nextfn) {
    if (!mod.isReady) {
        mod.isReady = true;

        //外部的密匙设置文件
        mod.xcfg = require("../../xcfg.js");

        //基础模块和第三方模块
        mod.http = require('http');
        mod.socketio = require('socket.io');
        mod.url = require('url');
        mod.fs = require('fs');
        mod.path = require('path');
        mod.crypto = require('crypto');
        mod.moment = require('moment');
        mod.redis = require("redis");

        //重载modules文件夹下的所有js文件模块
        myModules = getMyModules();
        for (var attr in myModules) {
            var fpath = myModules[attr];
            mod[attr] = require('./' + fpath);
        };


        //监听xcfg文件变动
        mod.watchs.paths.push('../xcfg.js');
        mod.watchs.fns['../xcfg.js'] = function (event, fname) {
            reloadModule(fname, '../', '../../');
            console.log('>>>lib xcfg', mod.xcfg);
        };



        //监听modules下所有模块文件变动
        mod.watchs.paths.push('./myModules/');
        mod.watchs.fns['./myModules/'] = function (event, fname) {
            switch (event) {
            case 'change':
                //文件变化，重载这个模块
                reloadModule(fname);
                break;
            default:
                //其他情况，不管发生什么都全面检查
                var mds = getMyModules();
                for (var attr in mds) {
                    if (!myModules[attr]) {
                        //新增文件
                        var filename = mds[attr];
                        reloadModule(filename);
                    };
                };
                break;
            };
        };
    };
    return mod;
};



/*自动重载一个模块*/
function reloadModule(fname, relpath, prepath) {
    //获取require.cache的路径
    var fullpath;
    if (!relpath) {
        fullpath = mod.path.resolve() + '/myModules/' + fname;
    } else {
        fullpath = mod.path.resolve(relpath) + '/' + fname;
    };

    var basename = mod.path.basename(fname, '.js');
    myModules[basename] = fname; //向mymodules增加新的对象或更新
    delete require.cache[fullpath];

    //重新载入模块
    try {
        if (!prepath) {
            mod[basename] = require('./' + fname);
        } else {
            mod[basename] = require(prepath + fname);
        }
        mod.logr.log(['lib.reloadModule', 'Module reload ok:' + fname, 'OK']);
    } catch (err) {
        mod.logr.log(['lib.reloadModule', 'Module reload err:' + fname, err]);
    };
    if (mod[basename] && mod[basename].init) {
        //如果需要，重新初始化
        mod[basename].init();
    }
};


/*获取所有自定义模块js文件名*/
function getMyModules() {
    var res = {};
    var files = mod.fs.readdirSync('myModules')
    files.forEach(function (file) {
        var fpath = './myModules/' + file;
        var stat = mod.fs.lstatSync(fpath);
        var ext = mod.path.extname(fpath);
        //排除文件夹和lib.js
        if (!stat.isDirectory() && ext == '.js') {
            var fname = mod.path.basename(fpath, '.js');
            res[fname] = file;
        };
    });
    return res;
};




/*导出*/
module.exports = mod;
