/**
* jquery.uploader.js
* @create: 2013.11.01
* @update: 2013.11.21
* admin@laoshu133.com
*/
/**
onerror回调，也可以使用uploader.addListener('error', function(event, errorExt){...});
回调参数如下：
event: {
	type: 'error',
	// other params
}
errorExt: {
	type: 'error type',
	message: 'error message'
	// other params
}

errorExt.type 所有值参考：
	1. load, 单个控件加载失败或者加载超时触发；此时errorExt会有uploadType参数，表示加载的是什么控件；可能多次触发
	2. support, 所有支持（指定）的控件都加载或初始化失败；此时errorExt会有uploadType参数，表示最后一次加载的是什么控件；只会触发一次
	3. add, 在添加文件时，以下情况会触发，可能多次触发；其中除 3.1 ，event具有file属性，表示当前出错的文件
		3.1 超过设定的文件最大个数，errorExt.errorCode = -100
		3.2 单个文件扩展名不合法，errorExt.errorCode = -110
		3.3 单个文件大小超过设定值，errorExt.errorCode = -120
		3.4 ops.onbeforeadd回调时return false，errorExt.errorCode = -190
	4. nofile, 当需要进行某些操作（例如：add,upload,abort）时，未传入文件时触发；可能多次触发
	5. beforeupload, 一般不会出现此错误，只有当扩展了自定义方法或者重写了部分upload方法时触发；可能多次触发
	5. upload, 当上传过程中出错，或者服务返回状态不为200时触发，当上传类型为iframe时不会触发此回调；可能多次触发
	6. parseerror, 当一个文件上传完成，服务端返回数据不能转换成指定的dataType时触发；可能多次触发
	7. process, 当一个文件上传完成，且返回数据在ops.onreceivedata回调中return false时触发；可能多次触发
	7. callflash, 只有为swf上传时，且与flash通信错误，才会触发；可能多次触发
*/
;(function(factory, global){
	if(typeof define === 'function'){
		define(factory);
	}
	else{
		var ds = global.ds || (global.ds = {});
		ds.Uploader = factory();
	}
}(function(){
	var
	$ = jQuery,
	global = window,
	noop = function(){},
	Uploader = function(ops){
		this.init(ops || {});
	},
	basePath = $('script').last().attr('src') || '';
	basePath = basePath.slice(0, basePath.lastIndexOf('/') + 1);
	Uploader.defaultOptions = {
		//Elems
		form: null,
		input: null,
		panel: null,
		dragPanel: null,
		filePanel: null,

		//Upload Options
		data: {},
		action: '',
		fieldName: 'ds_uploader',
		autoUpload: true,
		multiple: true,
		maxFileCount: 0, //最大文件数，0-不限制
		maxFileSize: 2048 * 1024, //单文件最大体积，默认2M
		acceptDescription: '所有文件', //input:file accept
		allowExts: '*', //'jpg,png,gif,jpeg'
		accept: '', //input:file accept
		type: 'auto', //auto, 'ajax', swf, iframe
		typeOrder: ['ajax', 'swf', 'iframe'],
		loadCache: false, //加载控件是否缓存
		loadTimeout: 10000, //单个控件加载允许超时, ms
		dataType: 'string', //服务端返回数据格式 string,json

		//Event Callbacks
		oninit: noop,
		onstartload: noop,
		onready: noop,
		onbeforeadd: noop, //return false则阻止文件进入列队
		onstart: noop,
		onbeforeupload: noop, //return false则阻止文件上传
		onreceivedata: noop, //请求完成，onupload之前响应；return false则阻止onload触发
		onupload: noop,
		onprogress: noop,
		onabort: noop,
		onerror: noop,
		oncomplete: noop,

		//SWF Options
		swfPanel: null, //不存在时为 ops.panel
		swfOptions: {
			url: basePath + 'swfuploader.swf',
			className: 'ds_swfuploader',
			cssText: 'position:absolute',
			allowScriptAccess: 'always',
			wmode: 'transparent',
			quality: 'high',
			height: '100%',
			width: '100%',
			buttonImage: '',
			cursor: 'pointer'
		}
    };
	Uploader.prototype = {
		constructor: Uploader,
		init: function(ops){
			var k, _ops = Uploader.defaultOptions, toString = Object.prototype.toString;
			for(k in _ops){
				//2 level deep copy
				if(_ops[k] && toString.call(_ops[k]) === '[object Object]'){
					ops[k] = mix(ops[k] || {}, _ops[k]);
				}
				else if(typeof ops[k] === 'undefined'){
					ops[k] = _ops[k];
				}
			}
			this.ops = ops;
			this.id = guid();
			this.support = {};
			this.fileCount = 0;
			this.uploadQueue = [];
			this.disabled = false;
			this.debug = !!ops.debug;

			this.input = $(ops.input);
			if(!this.input.length){ throw 'Param input error'; }
			this.form = $(this.input[0].form || ops.form);
			this.filePanel = $(ops.filePanel);
			this.panel = $(ops.panel);
			if(!this.panel.length){
				this.panel = this.input.parent();
			}

			this.typeIndex = 0;
			if(ops.type !== 'auto'){
				this.typeIndex = Math.max(0, $.inArray(ops.type, ops.typeOrder));
			}

			this.initEvent();
			this.status = 'ready';
			this.fireEvent('init');
			
			//delay for addlistener
			var self = this;
			setTimeout(function(){
				self.initHandler(self.typeIndex);
			}, 0);
		},
		//Base
		initEvent: function(){
			this.addListener('@ready', function(e, support){
				clearTimeout(this.loadTimer);

				if(support && support.enabled){
					mix(this.support, support, true);
					this.fireEvent(mix({type: 'ready'}, e));

					//Queue Data
					var 
					files = [],
					ops = this.ops,
					queueData = ops.queueData,
					autoUpload = ops.autoUpload;
					if(queueData && queueData.length > 0){
						ops.autoUpload = false;
						for(var data,file,i=0,len=queueData.length; i<len; i++){
							if((data = queueData[i]) && data.name){
								file = new File(data);
								file.setState(data.status || 'success');
								data.progress && file.setProgress(data.progress);
								files.push(file);
							}
						}
						this.add(files);
						ops.autoUpload = autoUpload;
						this.eachQueue(function(file){
							if(file.status === 'success' || file.status === 'error'){
								this.fireEvent({
									type: file.status === 'success' ? '@upload' : '@uploaderror',
									message: file.fileData.message || '',
									result: file.fileData.result,
									file: file
								});
							}
						});
					}
				}
				else{
					this.initHandler(this.typeIndex + 1);
				}
			})
			.addListener('@startupload', function(e){
				e.file.setState('uploading');

				this.fireEvent(mix({type: 'startupload'}, e));
			})
			.addListener('@progress', function(e){
				e.file.setProgress(e.progress, e.speed, e.remaining);

				this.fireEvent(mix({type: 'progress'}, e));
			})
			.addListener('@upload', function(e){
				var 
				errType, message,
				file = e.file, ret = e.result,
				ops = this.ops, dataType = ops.dataType,
				hasErr = false, complete = false, uploaded = 0;

				if(dataType === 'json' && typeof ret === 'string'){
					try{
						ret = $.parseJSON(ret);
					}
					catch(_){
						hasErr = true;
						errType = 'parsererror';
						message = 'Result data parse error';
					}
				}
				else if(dataType === 'string'){
					ret = String(ret);
				}
				file.result = e.result = ret;

				if(!hasErr && ops.onreceivedata.call(this, file, ret) === false){
					hasErr = true;
					errType = 'process';
					message = 'Server process error or data receive error';
				}

				if(hasErr){
					file.setState('error', message);
					this.fireEvent(mix({type: 'error'}, e), {
						type: errType,
						message: message
					});
				}
				else{
					file.setState('success');
					this.fireEvent(mix({type: 'upload'}, e), ret);

					this.eachQueue(function(file){
						file.status === 'success' && ++uploaded;
					});
					if(ops.maxFileCount > 0 && uploaded >= ops.maxFileCount){
						this.status = 'complete';
						this.uploadQueue = [];
						this.disable();
						this.fireEvent({
							type: 'complete',
							file: file
						});
						complete = true;
					}
				}

				if(!complete){
					this.status = 'ready';
					this.start();
				}
			})
			.addListener('@uploaderror', function(e){
				var errMsg = e.message || 'Network error or server error';
				e.file.setState('error', errMsg);

				this.fireEvent(mix({type: 'error'}, e), {
					type: 'upload',
					message: errMsg
				});

				this.status = 'ready';
				this.start();
			});
		},
		initHandler: function(inx){
			inx = Math.max(0, ~~inx);

			var 
			self = this,
			type = this.ops.typeOrder[inx] || '',
			handlerName = 'init' + type.slice(0, 1).toUpperCase() + type.slice(1) + 'Uploader';
			if(typeof this[handlerName] === 'function'){
				this.type = type;
				this.typeIndex = inx;
				clearTimeout(this.loadTimer);
				this.loadTimer = setTimeout(function(){
					self.fireEvent('error', {
						type: 'load',
						uploadType: type,
						message: 'Load timeout'
					});
					self.initHandler(self.typeIndex + 1);
				}, this.ops.loadTimeout);

				this.fireEvent({
					type: 'startload',
					uploadType: type
				});
				this[handlerName]();
			}
			else if(inx + 1 < this.ops.typeOrder.length){
				this.initHandler(inx + 1);
			}
			else{
				this.fireEvent('error', {
					type: 'support',
					uploadType: type,
					message: 'Not support'
				});
			}
		},
		//Enable, Disbale, Reset, Destroy
		_callTypeFunc: function(name){
			var fnName = this.type + name, args = [].slice.call(arguments, 1);
			if(typeof this[fnName] !== 'function' || this[fnName].apply(this, args) === false){
				return false;
			}
			return true;
		},
		enable: function(){
			if(this.disabled){
				this._callTypeFunc('Enable');

				this.input.prop('disabled', false);
				this.panel.removeClass('disabled');
				this.disabled = false;

				this.fireEvent('enable');
			}
		},
		disable: function(){
			if(!this.disabled){
				this._callTypeFunc('Disable');

				this.input.prop('disabled', true);
				this.panel.addClass('disabled');
				this.disabled = true;

				this.fireEvent('disable');
			}
		},
		reset: function(){
			this.stop();

			this.uploadQueue = [];
			this.fileCount = 0;
			this.enable();
		},
		destroy: function(){
			var input = this.input;
			if(this.input){
				this._callTypeFunc('Destroy');
				this.input.unbind('.ds_uploader');

				for(var k in this){
					if(this.hasOwnProperty(k)){
						delete this[k];
					}
				}
			}
		},
		rebuildInput: function(){
			var input = this.input.clone(true);
			this.input.before(input).remove();
			return (this.input = input);
		},
		//Upload queue
		_throwNoFile: function(type, errMsg){
			return this.fireEvent('error', {
				type: type || 'nofile',
				message: errMsg || 'not selected file, or file is empty!'
			});
		},
		eachQueue: function(callback){
			if(typeof callback === 'function'){
				for(var queue=this.uploadQueue,i=0,len=queue.length; i<len; i++){
					if(queue[i] && callback.call(this, queue[i], i) === false){
						break;
					}
				}
			}
			return this;
		},
		add: function(files){
			var ops = this.ops, queue = this.uploadQueue;
			if(this.disabled || this.status === 'complete'){ return this; }

			if(files && files.name){
				files = [files];
			}
			if(files && files.length > 0){
				var
				file, name, errorCode,
				hasErr = false, errMsg = '',
				allowExts = ops.allowExts.replace(/[\.\*]/g, '').replace(/,/g, '|'),
				rallowExts = allowExts !== '' ? new RegExp('^(?:'+ allowExts +')$', 'i') : '';
				for(var i = 0, len = files.length; i<len; i++){
					if(ops.maxFileCount > 0 && this.fileCount >= ops.maxFileCount){
						this.fireEvent('error', {
							type: 'add',
							errorCode: -100,
							message: 'Files exceeds the maximum'
						});
						break;
					}

					hasErr = false;
					file = new File(files[i]);
					if(allowExts !== '' && !rallowExts.test(file.extName)){
						errMsg = 'File type not allowed';
						errorCode = -110;
						hasErr = true;
					}
					else if(file.fileData && file.fileData.size > ops.maxFileSize){
						errMsg = 'File oversized';
						errorCode = -120;
						hasErr = true;
					}
					else if(ops.onbeforeadd.call(this, file) === false){
						errMsg = 'Not allowed by onbeforeadd return false';
						errorCode = -190;
						hasErr = true;
					}

					if(!hasErr){
						file.uploadIndex = queue.length;
						file.queuedStamp = +new Date();
						file.uploader = this;
						queue.push(file);
						this.fileCount++;

						this.filePanel.append(file.getDOM());
						this.fireEvent({
							type: 'add',
							file: file
						}, file);
					}
					else{
						this.fireEvent({
							type: 'error',
							file: file
						}, {
							type: 'add',
							message: errMsg,
							errorCode: errorCode
						});
					}
				}

				if(ops.maxFileCount > 0 && this.fileCount >= ops.maxFileCount){
					this.disable();
				}

				if(ops.autoUpload && this.fileCount > 0){
					this.start();
				}
			}
			else{
				this._throwNoFile();
			}
			return this;
		},
		start: function(){
			if(this.status === 'ready'){
				this.eachQueue(function(file){
					if(file.status === 'ready'){
						this.upload(file);
						return false;
					}
				});
			}
			return this;
		},
		stop: function(){
			if(this.status === 'uploading'){
				this.eachQueue(function(file){
					if(file.status === 'uploading'){
						this.abort(file);
						return false;
					}
				});
			}
			return this;
		},
		upload: function(file){
			if(!file || !file.name){
				return this._throwNoFile();
			}

			var 
			ops = this.ops,
			type = 'beforeupload',
			errMsg = 'Uploader uninitialized Or status error';
			if(this === file.uploader || this.status === 'ready' && ops.onbeforeupload.call(this, file) !== false){
				errMsg = 'File Data error';
				if(this._callTypeFunc('Upload', file)){
					this.status = 'uploading';
				}
			}

			if(this.status !== 'uploading'){
				file.setState('error', errMsg);
				this.fireEvent({
					type: 'error',
					file: file
				}, {
					type: type,
					message: errMsg
				});

				this.status = 'ready';
				this.start();
			}

			return this;
		},
		abort: function(file){
			if(!file || !file.name){
				return this._throwNoFile();
			}

			var fileStatus = file.status;
			if(fileStatus !== 'success' && file === this.uploadQueue[file.uploadIndex]){
				this._callTypeFunc('Abort', file);

				delete this.uploadQueue[file.uploadIndex];
				this.fileCount--;
				file.setState('abort');
				this.fireEvent({
					type: 'abort',
					file: file
				});

				//Continue Queue
				if(this.status !== 'complete'){
					if(fileStatus=== 'uploading'){
						this.status = 'ready';
					}
					if(this.fileCount > 0){
						this.start();
					}
					this.enable();
				}
			}
			return this;
		},
		remove: function(file){
			if(!file || !file.name){
				return this._throwNoFile();
			}

			if(this === file.uploader){
				this.abort(file);
				this._callTypeFunc('Remove', file);

				if(file === this.uploadQueue[file.uploadIndex]){
					delete this.uploadQueue[file.uploadIndex];
					this.fileCount--;
				}
				file.destroy();

				this.fireEvent({
					type: 'remove',
					file: file
				});
			}
			return this;
		},
		//Events
		addListener: function(type, callback){
			var
			events = this._events || (this._events = {}),
			handlers = events[type] || (events[type] = []);
			if(typeof callback === 'function'){
				handlers.push(callback);
			}
			return this;
		},
		removeListener: function(type, callback){
			var events;
			if(type && (events = this._events)){
				if(!callback){
					events[type] = [];
				}
				else{
					for(var i = events[type].length; i>=0; i--){
						if(callback === events[type][i]){
							events[type].splice(i, 1);
						}
					}
				}
			}
			return this;
		},
		fireEvent: function(evtent, data){
			var evt = { target: this };
			if(typeof evtent === 'string'){
				evt.type = evtent;
			}
			else if(typeof evtent === 'object'){
				for(var k in evtent){
					evt[k] = evtent[k];
				}
			}
			
			if(!evt.type){ throw 'Param type error'; }

			var
			ops = this.ops,
			events = this._events || {},
			handlers = [].concat(events[evt.type] || []);
			if(handlers.length > 0){
				for(var i = 0,len=handlers.length; i<len; i++){
					if(handlers[i].call(this, evt, data) === false){
						return;
					}
				}
			}
			if(ops && ops['on' + evt.type]){
				ops['on' + evt.type].call(this, evt, data);
			}
		},
		//XHR Level 2 upload
		testAjaxUpload: function(){
			var support = {
				ajaxUpload: !!(global.XMLHttpRequest && new XMLHttpRequest().upload), //XHR Level 2
				multiple: !!(global.FormData && global.FileList) //多文件
			};
			support.enabled = support.reupload = support.ajaxUpload;
			support.drag = support.ajaxUpload && support.multiple;
			if(/version\/([^\s]+)\ssafari/i.test(navigator.userAgent) && parseFloat(RegExp.$1) < 5.1){
				support.drag = false;
			}
			return support;
		},
		initAjaxUploader: function(){
			var self = this, support = this.testAjaxUpload();
			if(support && support.enabled){
				var 
				ops = this.ops,
				dragPanel = this.dragPanel = $(ops.dragPanel);
				if(!dragPanel.length){
					dragPanel = this.dragPanel = this.panel;
				}

				this.input.prop({
					accept: ops.accept,
					multiple: ops.multiple && ops.maxFileCount > 1
				})
				.bind('change.ds_uploader', function(){
					self.add(this.files);
					self.rebuildInput();
				});

				//Drop Files
				dragPanel.bind('dragover.ds_uploader', function(e){
					stopEvent(e);
					dragPanel.addClass('active');
				})
				.bind('dragleave.ds_uploader', function(e){
					stopEvent(e);
					dragPanel.removeClass('active');
				})
				.bind('drop.ds_uploader', function(e){
					stopEvent(e);
					dragPanel.removeClass('active');

					e = e.originalEvent;
					self.add(e.dataTransfer.files);
				});
			}
			this.fireEvent({
				type: '@ready',
				uploadType: 'ajax'
			}, support);
		},
		ajaxUpload: function(file){
			if(!file || !file.name){
				return this._throwNoFile();
			}

			//Simple validation File
			if(!file.fileData || !('type' in file.fileData)){
				return false;
			}

			var
			self = this,
			ops = this.ops,
			data = ops.data,
			formData = new FormData(),
			xhr = file.xhr = new XMLHttpRequest();
			formData.append(ops.fieldName, file.fileData);
			if(!!data){
				for(var k in data){
					formData.append(k, data[k]);
				}
			}

			xhr.upload.onprogress = function(e){
				var 
				speed = file.getSpeed(e.loaded),
				progress = 100 * e.loaded / e.total,
				remaining = 1000 * (e.total - e.loaded) / speed;

				self.fireEvent({
					type: '@progress',
					remaining: remaining,
					progress: progress,
					speed: speed,
					file: file
				});
			};
			xhr.onreadystatechange = function(){
				if(xhr.readyState === 4){
					var msg = '';
					if(xhr.status === 200){
						self.fireEvent({
							type: '@upload',
							result: xhr.responseText,
							file: file
						});
					}
					else{
						self.fireEvent({
							type: '@uploaderror',
							message: 'Network error or server error',
							file: file
						});
					}
				}
			};
			xhr.open('POST', ops.action, true);
			xhr.send(formData);
			
			this.fireEvent({
				type: '@startupload',
				file: file
			});
		},
		ajaxAbort: function(file){
			if(!file || !file.name){
				return this._throwNoFile();
			}

			if(file && file.xhr){
				file.xhr.onreadystatechange = null;
				file.xhr.abort();
				delete file.xhr;
			}
		},
		//Iframe upload
		getUploadIfrmae: function(){
			var 
			name = 'ds_upload_iframe_' + guid(),
			elem = document.createElement('div');
			elem.style.cssText = 'display:none;position:absolute;top:-999px';
			elem.innerHTML = '<iframe src="javascript:false" frameborder="0" name="' + name + '" id="' + name + '"></iframe>';
			elem = $(elem).appendTo('body');
			return {
				name: name,
				elem: elem.find('iframe'),
				destroy: function(){
					elem.find('iframe').attr('src', 'about:blank');
					elem.remove();
				}
			};
		},
		iframeFakeProgress: function(progress){
			progress = parseFloat(progress) || 0;
			return progress + Math.max(.5, .08 * (100-progress));
		},
		initIframeUploader: function(){
			var support = {};
			if(this.input[0].form){
				support.enabled = true;

				var self = this;
				this.addListener('add', function(file){
					//Only one upload thread
					this.disable();
				})
				.addListener('@upload', function(file){
					//For ops.queueData
					if(this.ops.maxFileCount <= 0 || this.fileCount < this.ops.maxFileCount){
						this.enable();
					}
				});
				this.input.bind('change.ds_uploader', function(){
					var name = this.value.replace(/\\/g, '/');
					self.add(this.files || {
						name: name.slice(name.lastIndexOf('/') + 1),
						size: -1
					});
				});
			}
			this.fireEvent({
				type: '@ready',
				uploadType: 'iframe'
			}, support);
		},
		iframeUpload: function(file){
			if(!file || !file.name){
				return this._throwNoFile();
			}

			if(!this.input.val()){
				return false;
			}

			var 
			self = this,
			ops = this.ops,
			data = ops.data,
			form = this.form[0],
			iframe = file.iframe = this.getUploadIfrmae(),
			attrCache = {
				encoding: form.encoding,
				action: form.action,
				method: form.method,
				target: form.target
			};
			iframe.elem.one('load', function(){
				var ret = null, hasErr = false, message = 'Network error or server error';
				try{
					message = 'Server error or not allowed access';

					var doc = iframe.elem[0].contentWindow.document;
					ret = (doc.body || doc.documentElement).innerHTML || ret;
				}
				catch(_){
					hasErr = true;
				}

				//Clean uploader, restore uploader
				clearInterval(file.progressTimer);
				delete file.iframe;
				iframe.destroy();

				if(!hasErr){
					self.fireEvent({
						type: '@upload',
						result: ret,
						file: file
					});
				}
				else{
					self.fireEvent({
						type: '@uploaderror',
						message: message,
						file: file
					});
				}
			});
			
			//Post data
			var k, dataPanel, dataHTML = '';
			if(!!data){
				dataPanel = document.createElement('div');
				for(k in data){
					dataHTML += '<input type="hidden" name="'+ k +'" value="'+ data[k] +'" />';
				}
				dataPanel.innerHTML = dataHTML;
				dataPanel.className = 'hide';
				form.appendChild(dataPanel);
			}

			this.input.prop('disabled', false);
			form.encoding = 'multipart/form-data';
			form.target = iframe.name;
			form.action = ops.action;
			form.method = 'post';
			form.submit();

			this.fireEvent({
				type: '@startupload',
				file: file
			});

			//Restore uploader
			this.rebuildInput();
			form.removeChild(dataPanel);
			form.target = attrCache.target;
			form.action = attrCache.action;
			form.target = attrCache.method;
			form.encoding = attrCache.encoding;
			this.input.prop('disabled', true);
			if(ops.maxFileCount <= 0 || this.fileCount < ops.maxFileCount){
				this.enable();
			}

			//fake progress
			var progress = 0, maxProgress = 99;
			if(this.iframeFakeProgress){
				file.progressTimer = setInterval(function(){
					progress = parseFloat(self.iframeFakeProgress(progress)) || 0;
					progress = Math.min(maxProgress, Math.max(0, progress));
					self.fireEvent({
						type: '@progress',
						progress: progress,
						remaining: -1,
						speed: -1,
						file: file
					});
					if(progress >= maxProgress){
						clearInterval(file.progressTimer);
					}
				}, 500);
			}
		},
		iframeAbort: function(file){
			if(!file || !file.name){
				return this._throwNoFile();
			}

			if(file.iframe){
				clearTimeout(file.progressTimer);
				file.iframe.elem.unbind('load');
				file.iframe.destroy();
				delete file.iframe;
			}
			else{
				this.rebuildInput();
			}
		},
		/**
		* SWFUpload
		* extend by swfupload 2.5
		* https://code.google.com/p/swfupload/
		* 已知BUG:
		*   首次添加2个文件，取消第2个，再添加1个或多个文件，首次添加的第1个文件会失败, -250, #2174
		*   貌似是因为swfupload采用匿名函数而引起Flash安全机制的问题
		*   http://www.actionscript.org/forums/showthread.php3?t=227560#edit959053
		*/
		getSwfVersion: function(){
			var 
			desc, swfPlugin,
			nav = navigator,
			version = [0, 0, 0],
			swfMime = 'application/x-shockwave-flash';
			if(nav.plugins && (swfPlugin = nav.plugins['Shockwave Flash'])){
				desc = swfPlugin.description;
				if(desc && !(nav.mimeTypes && nav.mimeTypes[swfMime] && !nav.mimeTypes[swfMime].enabledPlugin)){
					desc = desc.replace(/^.*\s+(\S+\s+\S+$)/, '$1');
					version[0] = ~~desc.replace(/^(.*)\..*$/, '$1');
					version[1] = ~~desc.replace(/^.*\.(.*)\s.*$/, '$1');
					version[2] = ~~desc.replace(/^.*[a-zA-Z]+(.*)$/, '$1');
				}
			}
			else if(global.ActiveXObject){
				try{
					var swf = new ActiveXObject('ShockwaveFlash.ShockwaveFlash');
					if(swf && (desc = swf.GetVariable('$version'))){
						desc = desc.split(" ")[1].split(",");
						version = [~~desc[0], ~~desc[1], ~~desc[2]];
					}
				}
				catch(_){}
			}
			return version;
		},
		getSwfHTML: function(){
			var 
			swfOps = mix(this.ops.swfOptions || {}, Uploader.defaultOptions.swfOptions),
			tmpl = '<object id="{id}" width="{width}" height="{height}" class="{className}" style="{cssText}" data="{rurl}" type="application/x-shockwave-flash"><param name="allowScriptAccess" value="{allowScriptAccess}" /><param name="flashvars" value="{flashvars}" /><param name="quality" value="{quality}" /><param name="wmode" value="{wmode}" /><param name="movie" value="{rurl}" /></object>';

			swfOps.flashvars = this.getSwfVars();
			swfOps.id = this.swfUploaderId;
			swfOps.rurl = swfOps.url;
			if(!this.ops.loadCache){
				swfOps.rurl += (swfOps.url.indexOf('?') > -1 ? '&_=' : '?_=') + (+new Date());
			}
			return fill(tmpl, swfOps);
		},
		getSwfVars: function(){
			var 
			params = [],
			ops = this.ops,
			data = ops.data,
			swfOps = ops.swfOptions,
			panel = this.panel;
			if(!!data){
				for(var k in data){
					params.push(encodeURIComponent(k) +'='+ encodeURIComponent(data[k]));
				}
			}

			return ['movieName=', encodeURIComponent('ds_uploader_swf_' + this.id),
				'&amp;uploadURL=', encodeURIComponent(ops.action),
				//'&amp;useQueryString=', '',
				//'&amp;requeueOnError=', '',
				'&amp;httpSuccess=', '',
				//'&amp;assumeSuccessTimeout=', 0,
				'&amp;params=', encodeURIComponent(params.join('&amp;')),
				'&amp;filePostName=', encodeURIComponent(ops.fieldName),
				'&amp;fileTypes=', encodeURIComponent('*.' + ops.allowExts.split(',').join(';*.')),
				'&amp;fileTypesDescription=', encodeURIComponent(ops.acceptDescription),
				'&amp;fileSizeLimit=', 0, //ops.maxFileSize + 'B',
				'&amp;fileUploadLimit=', 0, //, ops.maxFileCount,
				'&amp;fileQueueLimit=', 0,
				'&amp;debugEnabled=', this.debug,
				'&amp;buttonImageURL=', encodeURIComponent(swfOps.buttonImage),
				'&amp;buttonWidth=', isFinite(ops.swfWidth) ? ops.swfWidth : panel.width(),
				'&amp;buttonHeight=', isFinite(ops.swfHeight) ? ops.swfHeight : panel.height(),
				'&amp;buttonText=', '',
				//'&amp;buttonTextTopPadding=', encodeURIComponent(this.settings.button_text_top_padding),
				//'&amp;buttonTextLeftPadding=', encodeURIComponent(this.settings.button_text_left_padding),
				//'&amp;buttonTextStyle=', encodeURIComponent(this.settings.button_text_style),
				'&amp;buttonAction=', !ops.multiple || ops.maxFileCount === 1 ? -100 : -110,
				'&amp;buttonDisabled=', true, //ready swfEnable
				'&amp;buttonCursor=', -1 //swfOps.cursor === 'default' ? -1 : -2
			].join('');
		},
		getSwfAPI: function(){
			var 
			self = this,
			SWFUpload = global.SWFUpload || (global.SWFUpload = { version: '2.5.0' }),
			instances = SWFUpload.instances || (SWFUpload.instances = {}),
			api = instances[this.swfUploaderId];
			if(!api){
				api = instances[this.swfUploaderId] = {
					//["mouseClick", "mouseOver", "mouseOut", "fileDialogStart", "fileQueued", "fileQueueError", "fileDialogComplete", "uploadResizeStart", "uploadStart", "returnUploadStart", "upload_start_handler", "upload_start_handler", "uploadProgress", "uploadError", "uploadSuccess", "uploadComplete"]
					debug: noop,
					//debug: function(msg){ console.group(' - swf upload - '); console.log(msg); console.groupEnd(' - swf upload - '); },
					getFile: function(fileData){
						var ret = null;
						fileData && self.eachQueue(function(file){
							if(file.dataId === fileData.id){
								ret = file;
								return false;
							}
						});
						return ret;
					},
					callFlash: function(name){
						var ret, elem, args;
						try{
							elem = document.getElementById(self.swfUploaderId);
							args = __flash__argumentsToXML([].slice.call(arguments, 1), 0);
							ret = eval(elem.CallFunction('<invoke name="' + name + '" returntype="javascript">' + args + '</invoke>'));
						}
						catch(ex){
							self.fire('error', {
								type: 'callflash',
								message: ex.message
							});
						}
						return ret;
					},
					fileQueued: function(fileData){
						var tmpQueue = this.tmpQueue || (this.tmpQueue = []);
						tmpQueue.push(fileData);
					},
					fileDialogComplete: function(count, addCount, queueCount){
						var tmpQueue = this.tmpQueue;
						if(tmpQueue && addCount > 0 && tmpQueue.length > 0){
							self.add(tmpQueue);
							self.eachQueue(function(file){
								if(!file.dataId){
									file.dataId = file.fileData.id; //mark dataId for getFile
									for(var i = tmpQueue.length-1; i>=0; i--){
										if(file.fileData === tmpQueue[i]){
											tmpQueue.splice(i, 1);
											break;
										}
									}
								}
							});
							if(tmpQueue.length > 0){
								for(var i=tmpQueue.length-1; i>=0; i--){
									this.callFlash('CancelUpload', tmpQueue[i].id, false);
								}
							}
							delete this.tmpQueue;
						}
					},
					fileQueueError: function(fileData){
						self.add(fileData);
					},
					uploadProgress: function(fileData, loaded, total){
						var 
						file = this.getFile(fileData),
						speed = file.getSpeed(loaded),
						progress = 100 * loaded / total,
						remaining = 1000 * (total - loaded) / speed;

						self.fireEvent({
							type: '@progress',
							remaining: remaining,
							progress: progress,
							speed: speed,
							file: file
						});
					},
					uploadSuccess: function(fileData, data){
						this.getFile(fileData).result = data;
					},
					uploadError: function(fileData, errCode, errMsg){
						var 
						file = this.getFile(fileData),
						errMsgHash = {'-200':'Http error','-210':'Missing upload url','-220':'IO error','-230':'Security error','-240':'Upload limit exceeded','-250':'Upload failed','-260':'Specified file id not found','-270':'File validation failed','-280':'File cancelled','-290':'Upload stopped','-300':'Resize'};
						
						file.errorMessage = errMsgHash[errCode] || errMsg;
						file.errorCode = errCode;
					},
					uploadComplete: function(fileData){
						//filestatus, QUEUED : -1, IN_PROGRESS : -2, ERROR : -3, SUCCESS : -4, CANCELLED : -5
						var file = this.getFile(fileData);
						if(fileData.filestatus === -4){
							self.fireEvent({
								type: '@upload',
								result: file.result || '',
								file: file
							});
						}
						else if(fileData.filestatus === -3){
							self.fireEvent({
								type: '@uploaderror',
								message: file.errorMessage,
								file: this.getFile(fileData)
							});
						}
					},
					mouseOver: function(){
						self.swfPanel.addClass('hover');
					},
					mouseOut: function(){
						self.swfPanel.removeClass('hover');
					}
				};
			}
			return api;
		},
		initSwfUploader: function(){
			var support = {
				enabled: !!this.getSwfVersion()[0]
			};
			if(support.enabled){
				this.swfUploaderId = 'ds_uploader_swf_' + this.id;
				this.swfPanel = $(this.ops.swfPanel);
				if(!this.swfPanel.length){
					this.swfPanel = this.panel;
				}

				var self = this, api = this.getSwfAPI();
				api.flashReady = function(){
					self.swfEnable();
					self.fireEvent({
						type: '@ready',
						uploadType: 'swf'
					}, support);

					//only ready once
					api.flashReady = noop;
				};

				//be safe for load error
				this.addListener('error', function(e, data){
					if(data && data.type === 'load' && data.uploadType === 'swf'){
						this.removeListener('error', arguments.callee);

						this.swfDestroy();
					}
				});

				var div = document.createElement('div');
				div.innerHTML = this.getSwfHTML();
				this.swfPanel.append(div.firstChild);
			}
			else{
				this.fireEvent({
					type: '@ready',
					uploadType: 'swf'
				}, support);
			}
		},
		swfUpload: function(file){
			if(!file || !file.name){
				return this._throwNoFile();
			}

			if(!file.fileData || !file.fileData.id){
				return false;
			}

			var api = this.getSwfAPI();
			api.callFlash('StartUpload', file.fileData.id);
			api.callFlash('ReturnUploadStart', true);

			this.fireEvent({
				type: '@startupload',
				file: file
			});
		},
		swfAbort: function(file){
			if(!file || !file.name){
				return this._throwNoFile();
			}

			var api = this.getSwfAPI();
			//api.callFlash('StopUpload');
			api.callFlash('CancelUpload', file.fileData.id, false);
		},
		swfEnable: function(){
			var api = this.getSwfAPI();
			api.callFlash('SetButtonDisabled', false);
			api.callFlash('SetButtonCursor', this.ops.swfOptions.cursor === 'default' ? -1 : -2);
		},
		swfDisable: function(){
			var api = this.getSwfAPI();
			api.callFlash('SetButtonCursor', -1);
			api.callFlash('SetButtonDisabled', true);
		},
		swfDestroy: function(){
			try{
				delete SWFUpload.instances[this.swfUploaderId];

				//Private: removes fuctions to prevent memory leaks in IE.
				var k, elem = document.getElementById(this.swfUploaderId);
				for(k in elem){
					if(typeof elem[k] === 'function'){
						elem[k] = null;
					}
				}
				elem.parentNode.removeChild(elem);
			}
			catch(_){}
		}
	};

	//File
	var File = Uploader.File = function(data){
		if(data instanceof File){
			return data;
		}
		this.init(data || {});
	};
	File.prototype = {
		constructor: File,
		init: function(data){
			this.id = guid();
			this.fileData = data;
			this.size = ~~data.size;
			this.name = data.name || '';
			this.type = data.type || '';
			this.extName = data.extName || File.getExtName(this.name);

			this.status = 'ready';
			this.fitSize = File.getFitSize(this.size);
			this.remaining = this.elapsed = this.progress = this.speed = 0;
		},
		createDom: function(tmpl){
			if(!tmpl){
				tmpl = '<span class="name">{name}</span><div class="progress"><em style="width:0%"></em></div><div class="status"><span>等待上传</span><a href="javascript:;" class="btn reupload hide">重新上传</a><a href="javascript:;" class="btn abort">取消</a></div><div class="props"><span class="type">{extName}</span><span class="size">{fitSize}</span><span class="timer"><i></i>剩余时间<em>00:00:00</em></span><span class="speed">0Kb/s</span></div>';
			}
			return $(document.createElement('li')).html(fill(tmpl, {
				name: this.name,
				extName: this.extName,
				fitSize: this.fitSize
			}));
		},
		getDOM: function(selector){
			if(!this.dom){
				var self = this, dom = this.dom = this.createDom();

				//File Events
				dom.delegate('a.abort', 'click.ds_uploader', function(e){
					e.preventDefault();

					self.uploader && self.uploader.abort(self);
				})
				.delegate('a.reupload', 'click.ds_uploader', function(e){
					e.preventDefault();

					self.setState('ready');
					self.uploader && self.uploader.upload(self);
				})
				.addClass('ready');
			}
			return selector ? this.dom.find(selector) : this.dom;
		},
		getSpeed: function(loaded){
			var 
			now = +new Date(),
			lastLoaded = this.lastLoaded || 0,
			stamp = this.uploadStamp || this.queuedStamp || now;
			if(now - stamp > 0 && loaded - lastLoaded > 0){
				this.uploadStamp = now;
				this.lastLoaded = loaded;
				return 1000 * (loaded - lastLoaded) / (now - stamp);
			}
			return 0;
		},
		setState: function(status, message){
			var 
			shell = this.getDOM(),
			statusElem = this.getDOM('.status span').attr('title', message||'');
			shell[0].className = this.status = status;
			switch(status){
				case 'ready':
					this.getDOM('.reupload,.abort').addClass('hide');
					statusElem.html('等待上传');
					this.setProgress(0, 0, 0);
					break;
				case 'uploading':
					this.getDOM('.abort').removeClass('hide');
					statusElem.html('上传中');
					break;
				case 'success':
					this.getDOM('.reupload,.abort,.speed').addClass('hide');
					statusElem.html('<i></i>完成');
					this.setProgress(100, 0, 0);
					this.clean();
					break;
				case 'error':
					if(this.uploader && this.uploader.support.reupload){
						this.getDOM('.reupload').removeClass('hide');
					}
					this.getDOM('.abort').removeClass('hide');
					statusElem.html('<i></i>失败');
					this.setProgress(100, 0, 0);
					break;
				case 'abort':
					this.getDOM('.reupload,.abort,.speed').addClass('hide');
					statusElem.html('已取消');
					this.setProgress(100, 0, 0);
					break;
			}
		},
		setProgress: function(progress, speed, remaining){
			this.progress = parseFloat(progress) || 0;
			this.getDOM('.progress em').css('width', this.progress.toFixed(2) + '%');
			if(isFinite(speed)){
				this.speed = speed;
				this.getDOM('.speed').html(speed >= 0 ? File.getFitSize(speed) + '/s' : '');
			}
			if(isFinite(remaining)){
				this.remaining = remaining;
				this.getDOM('.timer em').html(File.getFitRemaining(remaining));
			}
		},
		destroy: function(){
			this.clean();
			this.dom.remove();
			this.dom = this.uploader = null;
		},
		clean: function(){
			this.getDOM().undelegate('.ds_uploader');
		}
	};
	mix(File, {
		getExtName: function(name){
			return name.slice(name.lastIndexOf('.')+1).toLocaleLowerCase();
		},
		getFitSize: function(size){
			if(!isFinite(size) || ~~size < 0){ return '未知'; }

			size = Math.max(0, ~~size);
			if(size < 1024){
				return size + 'B';
			}
			else if(size < 1024 * 1024){
				return (size/1024).toFixed(2) + 'KB';
			}
			else if(size < 1024 * 1024 * 1024){
				return (size/1024/1024).toFixed(2) + 'MB';
			}
			else if(size < 1024 * 1024 * 1024 * 1024){
				return (size/1024/1024/1024).toFixed(2) + 'GB';
			}
			return size;
		}, 
		getFitRemaining: function(ms){
			if(!isFinite(ms) || ~~ms < 0){ return '未知'; }
			ms = Math.max(0, parseInt(ms, 10));

			var 
			s = ms / 1000,
			h = ~~(s / 3600),
			m = ~~((s - h*3600) / 60);
			s = (s - (h*3600 + m*60)).toFixed();
			return [h < 10 ? '0'+h : h, m < 10 ? '0'+m : m, s < 10 ? '0'+s : s].join(':');
		}
	});

	//guid
	var _guid = 0;
	function guid(){
		return _guid++;
	}
	
	//阻止冒泡、默认事件
	function stopEvent(e){
		if(!!e){
			e.preventDefault();
			e.stopPropagation();
		}
	}

	//mix, fill
	function mix(target, source, cover){
		for(var k in source){
			if(cover || target[k] === undefined){
				target[k] = source[k];
			}
		}
		return target;
	}
	function fill(tmpl, data){
		for(var k in data){
			tmpl = tmpl.replace(new RegExp('\\{'+ k +'\\}', 'g'), data[k]);
		}
		return tmpl;
	}

	mix(Uploader, { basePath: basePath, guid: guid, fill: fill, mix: mix });
	return Uploader;
}, this));

/**
* jquery.uploadwidget.js
* @create: 2013.10.14
* @update: 2013.10.14
* admin@laoshu133.com
*
* @deps jquery.uploader.js
*/
;(function(factory, global){
	if(typeof define === 'function'){
		define(['jquery.uploader'], factory);
	}
	else{
		var ds = global.ds || (global.ds = {});
		ds.UploadWidget = factory();
	}
}(function(Uploader){
	!Uploader && (Uploader = ds.Uploader);

	var 
	$ = jQuery,
	mix = Uploader.mix,
	fill = Uploader.fill,
	UploadWidget = function(ops){
		this.init(ops || {});
	};
	UploadWidget.prototype = {
		constructor: UploadWidget,
		init: function(ops){
			ops = this.ops = mix(ops, UploadWidget.defaultOptions);

			var shell = this.shell = $(ops.shell);
			if(!shell.length){ throw 'Param shell error'; }

			this.id = Uploader.guid();
			shell.html(fill(ops.htmlTmpl, {
				id: this.id,
				action: ops.action,
				fieldName: ops.fieldName || Uploader.defaultOptions.fieldName
			}));
			this.form = shell.find('form').eq(0);
			this.formPanel = this.form.parent();
			this.wrap = shell.find('.ds_uploader');
			ops.filePanel = shell.find('.ds_uploader_list ul').eq(0);
			ops.input = shell.find('input[type=file]').eq(0);
			ops.panel = ops.dragPanel = this.form;

			this.setTips(ops.uploadTips).showLoading(ops.loadingText);
			this.initUploader();
		},
		initUploader: function(){
			var 
			self = this,
			uploader = this.uploader = new Uploader(this.ops);
			uploader.addListener('startload', function(e){
				if(e.uploadType !== 'ajax' && e.uploadType !== 'iframe'){
					var 
					panelStyle = self.formPanel[0].style,
					styleCache = {
						display: panelStyle.display,
						opacity: panelStyle.opacity,
						filter: panelStyle.filter
					},
					restoreStyle = function(){
						panelStyle.filter = styleCache.filter;
						panelStyle.opacity = styleCache.display;
						panelStyle.display = styleCache.display;
					};

					panelStyle.opacity = '0';
					panelStyle.filter = 'Alpha(opacity=0)';
					panelStyle.display = 'block';

					this.addListener('ready', function(e){
						if(e.uploadType !== 'ajax' && e.uploadType !== 'iframe'){
							restoreStyle();
						}
					})
					.addListener('error', function(e, data){
						if(data && (data.type === 'load' || data.type === 'support')){
							this.removeListener('error', arguments.callee);

							restoreStyle();
						}
					});
				}
			})
			.addListener('ready', function(){
				var className = 'ds_uploader_onloading';
				if(this.support.drag){
					className += ' ds_uploader_nodrag';
				}
				this.form.parent().removeClass('hide');
				self.wrap.removeClass(className);
				self.hideLoading();
			})
			.addListener('error', function(e, ex){
				if(ex.type === 'support'){
					self.wrap.removeClass('ds_uploader_onloading').addClass('ds_uploader_onerror');
					self.showLoadError();
				}
			})
			.addListener('add', function(){
				if(this.fileCount <= 1){
					self.wrap.removeClass('ds_uploader_nofile');
				}
			})
			.addListener('complete', function(){
				self.showComplete();
			});
		},
		showLoading: function(msg, title){
			var elem = this.shell.find('.ds_uploader_loading');
			elem.html('<span title="'+ (title||'Loading...') +'"><i></i><em>'+ (msg||'Loading...') +'</em></span>');
			elem.removeClass('hide');
			return this;
		},
		hideLoading: function(){
			this.shell.find('.ds_uploader_loading').addClass('hide');
			return this;
		},
		setTips: function(tips){
			this.shell.find('.ds_uploader_tips').html(tips || '');
			return this;
		},
		showComplete: function(msg){
			var elem = this.shell.find('.ds_uploader_note').eq(1);
			elem.html('<span class="success"><i></i><strong>' + (msg||this.ops.completeText) + '</strong>').removeClass('hide');
		},
		showLoadError: function(msg, btnText){
			this.hideLoading();

			var elem = this.shell.find('.ds_uploader_note').eq(0);
			elem.html('<span class="error"><i></i><strong>' + (msg||this.ops.loadErrorText) + '</strong><a href="javascript:location.reload();">'+ (btnText||'重新加载') +'</a></span>').removeClass('hide');
		}
	};

	//defaultOptions
	UploadWidget.defaultOptions = {
		htmlTmpl: '<div class="ds_uploader_shell"><div id="ds_uploader_{id}" class="ds_uploader ds_uploader_nodrag ds_uploader_nofile ds_uploader_onloading"><div class="ds_uploader_loading"><span><i></i><em>Loading...</em></span></div><div class="ds_uploader_note hide"><span class="error"><i></i><strong>控件不小心加载失败了，请重试</strong><a href="javascript:location.reload();">重新加载</a></span></div><div class="ds_uploader_chooser hide"><form action="{action}" method="post" enctype="multipart/form-data"><div class="ds_uploader_drager"><i></i>拖动文件到此上传<span class="pipe">或</span></div><div class="ds_uploader_btn" title="选择文件上传"><span><input type="file" name="{fieldName}" id="ds_upload_file_{id}" hidefocus /></span></div></form><div class="ds_uploader_tips"></div></div><div class="ds_uploader_info"><div class="ds_uploader_note hide"><span class="success"><i></i><strong>上传成功，处理中，请稍候...</strong></span></div><div class="ds_uploader_list"><h3><i></i>上传列表</h3><ul></ul></div></div></div></div>',
		loadErrorText: '控件不小心加载失败了，请重试',
		completeText: '上传成功，处理中，请稍候...',
		loadingText: '努力加载加载中，请稍候...',
		uploadTips: ''
    };
	return UploadWidget;
}, this));

//Extend jQuery
;(function($, Uploader){
	$.fn.uploader = function(options){
		if(!$.isPlainObject(options)){
			options = {};
		}

		return this.each(function(){
			var attrOps = this.getAttribute('data-uploader-options');
			if(typeof attrOps === 'string'){
				try{
					attrOps = $.parseJSON(attrOps);
				}
				catch(_){}
			}
			var ops = $.extend({}, options, attrOps);
			if(!ops.action && this.form){
				ops.action = this.form.action;
			}
			ops.fieldName = this.name;
			ops.input = this;

			$.data(this, 'uploader', new Uploader(ops));
		});
	};
})(jQuery, this.ds && ds.Uploader);