const path=require('node:path'),os=require('node:os');
module.exports=function(name){try{return require(name);}catch(error){const base=process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');try{return require(path.join(base,name));}catch{throw error;}}};
