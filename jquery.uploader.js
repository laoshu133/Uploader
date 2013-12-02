/**
* ds.Uploader
* @create: 2013.10.14
* @update: 2013.10.14
* admin@laoshu133.com
*
* @dep ds.tmpl
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
	};
	Uploader.defaultOptions = {
		shell: null,
		multiple: true,
		maxFileCount: 0, //最大文件数，0-不限制
		maxFileSize: 2048 * 1024, //单文件最大体积，默认2M
		autoUpload: true,
		uploadTips: '',
		fieldName: 'ds_uploader',
		type: 'auto', //auto, 'ajax', swf, applet, post
		typeOrder: ['ajax', 'swf', 'applet', 'post'],
		allowExts: '*', //'jpg,png,gif,jpeg'
		accept: '', //input:file accept
		acceptDescription: '所有文件', //input:file accept
		action: './',
		loadErrorText: '控件不小心加载失败了，请重试',
		completeText: '上传成功，处理中，请稍候...',
		loadCache: false, //加载控件是否缓存
		loadTimeout: 8000, //单个控件加载允许超时, ms
		dataType: 'string',
		onbeforeaddfile: noop, //return false则阻止文件进入列队
		oninit: noop,
		startload: noop,
		onready: noop,
		onstart: noop,
		onbeforeupload: noop, //return false则阻止文件上传
		onreceivedata: noop, //请求完成，onupload之前响应；return false则阻止onload触发
		onupload: noop,
		onprogress: noop,
		onabort: noop,
		onerror: noop,
		oncomplete: noop,
		
		//SWF Options
		swfUrl: 'swfuploader.swf',
		swfAllowScriptAccess: 'always',
		swfCssText: 'position:absolute',
		swfWmode: 'transparent',
		swfCursor: 'pointer',
		swfButtonImage: '',
		swfQuality: 'high',
		swfWidth: '100%',
		swfHeight: '100%'
    };
	Uploader.prototype = {
		constructor: Uploader,
		init: function(ops){
			var k, _ops = Uploader.defaultOptions;
			for(k in _ops){
				if(typeof ops[k] === 'undefined'){
					ops[k] = _ops[k];
				}
			}
			this.ops = ops;
			this.id = guid();
			this.support = {};
			this.uploadQueue = [];
			this.disabled = false;
			this.debug = !!ops.debug;
			this.fileCount = 0;
			

			var shell = this.shell = $(ops.shell);
			if(!shell.length){ throw '参数shell错误！'; }

			this.typeIndex = 0;
			if(ops.type !== 'auto'){
				this.typeIndex = Math.max(0, $.inArray(ops.type, ops.typeOrder));
			}

			var html = ops.htmlTmpl || '<div class="ds_uploader_shell"><div id="ds_uploader_{id}" class="ds_uploader ds_uploader_nodrag ds_uploader_nofile ds_uploader_onloading"><div class="ds_uploader_loading hide"><span title="正在载入上传控件，请稍候..."><i></i><em>Loading...</em></span></div><div class="ds_uploader_note hide"><span class="error"><i></i><strong>控件不小心加载失败了，请重试</strong><a href="javascript:location.reload();">重新加载</a></span></div><div class="ds_uploader_chooser hide"><form action="{action}" method="post" enctype="multipart/form-data"><div class="ds_uploader_drager"><i></i>拖动文件到此上传<span class="pipe">或</span></div><div class="ds_uploader_btn" title="选择文件上传"><span><input type="file" name="{field_name}" id="ds_upload_file_{id}" hidefocus /></span></div></form><div class="ds_uploader_tips"></div></div><div class="ds_uploader_info"><div class="ds_uploader_note hide"><span class="success"><i></i><strong>上传成功，处理中，请稍候...</strong></span></div><div class="ds_uploader_list"><h3><i></i>上传列表</h3><ul></ul></div></div></div></div>';
			shell.html(html.replace(/\{id\}/g, this.id).replace(/\{action\}/g, ops.action).replace(/\{field_name\}/g, ops.fieldName));
			this.form = shell.find('form').eq(0);
			this.panel = shell.find('.ds_uploader');
			this.chooser = shell.find('input[type=file]');
			this.chooserPanel = shell.find('.ds_uploader_chooser');
			this.listShell = shell.find('.ds_uploader_list');
			this.listPanel = this.listShell.find('ul').eq(0);
			this.tipsPanel = shell.find('.ds_uploader_tips');

			this.showLoading().setTips(ops.uploadTips);

			this.initEvent();
			this.status = 'ready';
			this.fireEvent('init');
			this.initHandler(this.typeIndex);
		},
		//Layouts
		showLoading: function(msg){
			if(!this.loadingElem){
				this.loadingElem = this.panel.find('.ds_uploader_loading');
			}
			this.loadingElem.html('<span title="正在载入上传控件，请稍候..."><i></i><em>'+ (msg||'Loading...') +'</em></span>');
			this.loadingElem.removeClass('hide');
			return this;
		},
		hideLoading: function(){
			this.loadingElem.addClass('hide');
			return this;
		},
		setTips: function(tips){
			this.tipsPanel.html(tips || '');
		},
		showComplete: function(msg){
			var elem = this.shell.find('.ds_uploader_note').eq(1);
			elem.html('<span class="success"><i></i><strong>' + (msg||this.ops.completeText) + '</strong>').removeClass('hide');
		},
		showLoadError: function(msg){
			var elem = this.shell.find('.ds_uploader_note').eq(0);
			elem.html('<span class="error"><i></i><strong>' + (msg||this.ops.loadErrorText) + '</strong><a href="javascript:location.reload();">重新加载</a></span>').removeClass('hide');
		},
		//Base
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
				this.hideLoading().showLoadError();
				this.fireEvent('error', {
					type: 'support',
					uploadType: type,
					message: 'Not support'
				});
			}
		},
		initEvent: function(){
			this.addListener('@ready', function(e, support){
				clearTimeout(this.loadTimer);
				if(support && support.enabled){
					$.extend(this.support, support);
					var className = 'ds_uploader_onloading';
					support.drag && (className += ' ds_uploader_nodrag');
					this.chooserPanel.removeClass('hide');
					this.panel.removeClass(className);
					this.hideLoading();

					this.fireEvent(mix({type: 'ready'}, e));
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

				if(dataType === 'json'){
					try{
						ret = $.parseJSON(ret);
					}
					catch(_){
						hasErr = true;
						errType = 'parsererror';
						message = '数据转换错误';
					}
				}
				else if(dataType === 'string'){
					ret = String(ret);
				}

				if(!hasErr && ops.onreceivedata.call(this, file, ret) === false){
					hasErr = true;
					errType = 'process';
					message = '服务处理出错或者数据效验失败';
				}

				if(hasErr){
					file.setState('error', message);
					this.fireEvent(mix({type: 'error'}, e), {
						file: file,
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
						this.showComplete();
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
				var errMsg = e.message || '网络错误，或者服务器出错';
				e.file.setState('error', errMsg);

				this.fireEvent(mix({type: 'error'}, e), {
					file: e.file,
					type: 'upload',
					message: errMsg
				});

				this.status = 'ready';
				this.start();
			});
		},
		//Enable, Disbale, Destroy
		enable: function(){
			if(this.disabled){
				var fnName = this.type + 'Enable';
				if(this[fnName]){
					this[fnName]();
				}

				this.chooser[0].disabled = false;
				this.form.removeClass('disabled');
				this.disabled = false;
			}
		},
		disable: function(){
			if(!this.disabled){
				var fnName = this.type + 'Disable';
				if(this[fnName]){
					this[fnName]();
				}

				this.chooser[0].disabled = true;
				this.form.addClass('disabled');
				this.disabled = true;
			}
		},
		destroy: function(){
			if(this.shell){
				var fnName = this.type + 'Destroy';
				if(this[fnName]){
					this[fnName]();
				}
				
				var shell = this.shell;
				for(var k in this){
					if(this.hasOwnProperty(k)){
						delete this[k];
					}
				}
				shell.html('');
			}
		},
		//Upload queue
		_throwNoFile: function(type){
			return this.fireEvent('error', {
				type: type || 'upload',
				message: 'not selected file, or file is empty!'
			});
		},
		eachQueue: function(callback){
			if(typeof  callback === 'function'){
				for(var queue=this.uploadQueue,i=0,len=queue.length; i<len; i++){
					if(queue[i] && callback.call(this, queue[i], i) === false){
						break;
					}
				}
			}
			return this;
		},
		addFile: function(files){
			var ops = this.ops, queue = this.uploadQueue;
			if(this.disabled || this.status === 'complete'){ return this; }

			if(files && files.name){
				files = [files];
			}
			if(files && files.length > 0){
				var
				file, name,
				hasErr = false, errMsg = '',
				allowAllExt = ops.allowExts === '*',
				allowExts = !allowAllExt ? ops.allowExts.replace(/,/g, '|') : '',
				rallowExts = !allowAllExt ? new RegExp('^(?:'+ allowExts +')$', 'i') : '';
				for(var i = 0, len = files.length; i<len; i++){
					if(ops.maxFileCount > 0 && this.fileCount >= ops.maxFileCount){
						this.fireEvent('error', {
							type: 'addfile',
							message: 'Files exceeds the maximum'
						});
						break;
					}

					hasErr = false;
					file = new File(files[i]);
					if(!allowAllExt && !rallowExts.test(file.extName)){
						hasErr = true;
						errMsg = 'Extensions not allowed';
					}
					else if(file.fileData && file.fileData.size > ops.maxFileSize){
						hasErr = true;
						errMsg = 'File oversized';
					}
					else if(ops.onbeforeaddfile.call(this, file) === false){
						hasErr = true;
						errMsg = 'not allowed by onbeforeaddfile return false';
					}

					if(!hasErr){
						file.uploadIndex = queue.length;
						file.uploader = this;
						queue.push(file);
						this.fileCount++;

						this.listPanel.append(file.getDom());
						this.fireEvent({
							type: 'addfile',
							file: file
						});
					}
					else{
						this.fireEvent('error', {
							type: 'addfile',
							message: errMsg,
							file: file
						});
					}
				}

				if(ops.maxFileCount > 0 && this.fileCount >= ops.maxFileCount){
					this.disable();
				}

				if(this.fileCount > 0){
					this.panel.removeClass('ds_uploader_nofile');
					this.listShell.removeClass('hide');

					ops.autoUpload && this.start();
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
			var 
			ops = this.ops,
			hasErr = false,
			type = 'support',
			message = 'Uploader uninitialized Or status error';

			if(this.status === 'ready' && ops.onbeforeupload.call(this, file) !== false){
				var fnName = this.type + 'Upload';
				if(this[fnName]){
					this.status = 'uploading';
					this[fnName](file);
				}
				else{
					hasErr = true;
				}
			}
			
			if(hasErr || this.status !== 'uploading'){
				this.fireEvent('error', {
					type: type,
					message: message
				});
			}

			return this;
		},
		abort: function(file){
			if(!file || !file.name){
				return this._throwNoFile();
			}

			var fnName = this.type + 'Abort';
			if(this[fnName]){
				this[fnName](file);
			}

			delete this.uploadQueue[file.uploadIndex];
			this.fileCount--;
			file.setState('abort');
			this.fireEvent({
				type: 'abort',
				file: file
			});

			//Restore State
			if(this.status !== 'complete'){
				this.status = 'ready';
				this.enable();
			}

			if(this.fileCount > 0){
				this.start();
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

			var
			ops = this.ops,
			events = this._events || {},
			handlers = events[evt.type] || [];
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
				multiple: !!(global.FormData || global.FileList) //多文件
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
				var ops = this.ops;
				this.chooser.prop({
					accept: ops.accept,
					multiple: ops.multiple && ops.maxFileCount > 1
				});
				this.chooser.bind('change', function(){
					self.addFile(this.files);

					this.value = '';
				});

				//Drop Files
				this.panel.bind('dragover', function(e){
					stopEvent(e);
					self.form.addClass('active');
				})
				.bind('dragleave', function(e){
					stopEvent(e);
					self.form.removeClass('active');
				})
				.bind('drop', function(e){
					stopEvent(e);

					e = e.originalEvent;
					self.form.removeClass('active');

					self.addFile(e.dataTransfer.files);
				});

				//Prevent Document Drop
				$(document).bind('dragover', stopEvent)
					.bind('dragleave', stopEvent)
					.bind('drop', stopEvent);
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

			var
			self = this,
			ops = this.ops,
			data = new FormData(),
			xhr = file.xhr = new XMLHttpRequest();
			data.append(ops.fieldName, file.fileData);

			var loaded = 0, stamp = new Date();
			xhr.upload.onprogress = function(e){
				var 
				now = new Date(),
				elapsed = (now - stamp) / 1000,
				progress = 100 * e.loaded / e.total,
				speed = (e.loaded - loaded) / elapsed,
				remaining = 1000 * (e.total - e.loaded) / speed;
				
				self.fireEvent({
					type: '@progress',
					remaining: remaining,
					progress: progress,
					speed: speed,
					file: file
				});

				loaded = e.loaded;
				stamp = now;
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
							message: '网络错误，或者服务器出错',
							file: file
						});
					}
				}
			};
			xhr.open('POST', ops.action, true);
			xhr.send(data);
			
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
		//Form Post upload
		getUploadIfrmae: function(){
			var 
			name = 'ds_upload_iframe_' + guid(),
			elem = document.createElement('div');
			elem.style.cssText = 'display:none;position:absolute;top:-999px';
			elem.innerHTML = '<iframe src="javascript:false" frameborder="0" name="' + name + '" id="' + name + '"></iframe>';
			document.body.appendChild(elem);
			return {
				name: name,
				elem: $('iframe', elem),
				destroy: function(){
					var shell = $(elem);
					shell.find('iframe').attr('src', 'about:blank');
					shell.remove();
				}
			};
		},
		postFakeProgress: function(progress){
			progress = parseFloat(progress) || 0;
			return progress + Math.max(.5, .08 * (100-progress));
		},
		initPostUploader: function(){
			var support = {};
			if(this.chooser[0].form){
				support.enabled = true;

				var self = this;
				this.form.delegate('input[type=file]', 'change', function(){
					var name = this.value.replace(/\\/g, '/');
					self.addFile(this.files || {
						name: name.slice(name.lastIndexOf('/') + 1),
						size: -1
					});

					this.value = '';
				});
			}
			this.fireEvent({
				type: '@ready',
				uploadType: 'post'
			}, support);
		},
		postUpload: function(file){
			if(!file || !file.name){
				return this._throwNoFile();
			}

			var 
			self = this,
			form = this.form,
			oldTarget = this.form.attr('target') || '',
			iframe = file.iframe = this.getUploadIfrmae();

			iframe.elem.one('load', function(){
				var ret = null, hasErr = false, message = '网络错误，或者服务器出错';
				try{
					message = '返回数据读取错误，可能为跨域引起';

					var doc = iframe.elem[0].contentWindow.document;
					ret = (doc.body || doc.documentElement).innerHTML || ret;
				}
				catch(_){
					hasErr = true;
				}
				restoreUpload();

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
			this.chooser.prop('disabled', false);
			form.attr('target', iframe.name).submit();
			this.disable(); //Uploader only one thread

			this.fireEvent({
				type: '@startupload',
				file: file
			});

			//fake progress
			var progress = 0, maxProgress = 99;
			file.progressTimer = setInterval(function(){
				progress = parseFloat(self.postFakeProgress(progress)) || 0;
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

			function restoreUpload(){
				clearInterval(file.progressTimer);
				form.attr('target', oldTarget);
				delete file.iframe;
				iframe.destroy();

				self.enable();
			}
		},
		postAbort: function(file){
			if(!file || !file.name){
				return this._throwNoFile();
			}

			if(file.iframe){
				clearTimeout(file.progressTimer);
				file.iframe.elem.unbind('load');
				file.iframe.destroy();
				delete file.iframe;
			}
		},
		/**
		* SWFUpload
		* extend by swfupload 2.5
		* https://code.google.com/p/swfupload/
		* 已知BUG:
		*   首次添加2个文件，取消第二个，再添加一个或者多个文件，首次添加的第一个文件会失败, -250, #2174
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
		getSwfHTML: function(ops){
			var _ops = this.ops;
			ops = $.extend(true, {
				id: this.swfUploaderId,
				cssText: _ops.swfCssText || '',
				className: 'ds_swfuploader',
				height: _ops.swfHeight,
				width: _ops.swfWidth,
				url: _ops.swfUrl,
				extParams: {
					allowScriptAccess: _ops.swfAllowScriptAccess,
					flashvars: this.getSwfVars(),
					quality: _ops.swfQuality,
					wmode: _ops.swfWmode
				}
			}, ops);
			if(!ops.loadCache){
				ops.url += (ops.url.indexOf('?') > -1 ? '&_=' : '?_=') + (+new Date);
			}

			var tmpl = '<object id="<%=id%>" type="application/x-shockwave-flash" data="<%=url%>" width="<%=width%>" height="<%=height%>" class="<%=className%>" style="<%=cssText%>"><param name="movie" value="<%=url%>" /><% for(var k in extParams){ %><param name="<%=k%>" value="<%=extParams[k]%>" /><%}%></object>';
			return ds.tmpl(tmpl, ops);
		},
		getSwfVars: function(){
			var ops = this.ops, form = this.form;
			return ['movieName=', encodeURIComponent('ds_uploader_swf_' + this.id),
				'&amp;uploadURL=', encodeURIComponent(ops.action),
				//'&amp;useQueryString=', '',
				//'&amp;requeueOnError=', '',
				'&amp;httpSuccess=', '',
				//'&amp;assumeSuccessTimeout=', 0,
				//'&amp;params=', '',
				'&amp;filePostName=', encodeURIComponent(ops.fieldName),
				'&amp;fileTypes=', encodeURIComponent('*.' + ops.allowExts.split(',').join(';*.')),
				'&amp;fileTypesDescription=', encodeURIComponent(ops.acceptDescription),
				'&amp;fileSizeLimit=', 0, //ops.maxFileSize + 'B',
				'&amp;fileUploadLimit=', 0, //, ops.maxFileCount,
				'&amp;fileQueueLimit=', 0,
				'&amp;debugEnabled=', this.debug,
				'&amp;buttonImageURL=', encodeURIComponent(ops.swfButtonImage),
				'&amp;buttonWidth=', isFinite(ops.swfWidth) ? ops.swfWidth : form.width(),
				'&amp;buttonHeight=', isFinite(ops.swfHeight) ? ops.swfHeight : form.height(),
				'&amp;buttonText=', '',
				//'&amp;buttonTextTopPadding=', encodeURIComponent(this.settings.button_text_top_padding),
				//'&amp;buttonTextLeftPadding=', encodeURIComponent(this.settings.button_text_left_padding),
				//'&amp;buttonTextStyle=', encodeURIComponent(this.settings.button_text_style),
				'&amp;buttonAction=', !ops.multiple || ops.maxFileCount === 1 ? -100 : -110,
				'&amp;buttonDisabled=', true, //ready swfEnable
				'&amp;buttonCursor=', -1 //ops.swfCursor === 'default' ? -1 : -2
			].join('');
		},
		getSwfInstance: function(support){
			var 
			self = this,
			SWFUpload = global.SWFUpload || (global.SWFUpload = { version: '2.5.0' }),
			instances = SWFUpload.instances || (SWFUpload.instances = {}),
			instance = instances[this.swfUploaderId];
			if(!instance){
				instance = instances[this.swfUploaderId] = {
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
							self.addFile(tmpQueue);
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
					uploadProgress: function(fileData, loaded, total){
						var 
						file = this.getFile(fileData),
						stamp = file.progressStamp || +new Date(),
						elapsed = (new Date() - stamp) / 1000,
						prevLoaded = ~~file.loaded,
						remaining = 0;
						progress = 0,
						speed = 0;

						if(elapsed > 0){
							progress = 100 * loaded / total;
							speed = (loaded - prevLoaded) / elapsed;
							remaining = 1000 * (total - loaded) / speed;
						}

						self.fireEvent({
							type: '@progress',
							remaining: remaining,
							progress: progress,
							speed: speed,
							file: file
						});
						
						file.progressStamp = stamp;
						file.loaded = loaded;
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
						self.chooserPanel.addClass('hover');
					},
					mouseOut: function(){
						self.chooserPanel.removeClass('hover');
					}
				};
			}
			return instance;
		},
		initSwfUploader: function(){
			var support = {
				enabled: !!this.getSwfVersion()[0]
			};
			if(support.enabled){
				this.swfUploaderId = 'ds_uploader_swf_' + this.id;

				var self = this,
				div = document.createElement('div'),
				panelStyle = this.chooserPanel[0].style,
				panelDisplay = panelStyle.display,
				panelOpacity = panelStyle.opacity,
				panelFilter = panelStyle.filter,
				restorePanel = function(){
					panelStyle.filter = panelFilter;
					panelStyle.opacity = panelOpacity;
					panelStyle.display = panelDisplay;
				};
				
				var instance = this.getSwfInstance();
				instance.flashReady = function(){
					self.swfEnable();
					self.fireEvent({
						type: '@ready',
						uploadType: 'swf'
					}, support);

					instance.flashReady = noop; //only ready once
					restorePanel();
				};

				//be safe for swfupload load error
				this.addListener('error', function(e, data){
					if(data && data.type === 'load' && data.uploadType === 'swf'){
						this.removeListener('error', arguments.callee);
						restorePanel();

						try{
							$('#' + this.swfUploaderId).remove();
						}
						catch(_){}
					}
				});

				panelStyle.opacity = '0';
				panelStyle.filter = 'Alpha(opacity=0)';
				panelStyle.display = 'block';
				div.innerHTML = this.getSwfHTML();
				this.form.append(div.firstChild);
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

			var instance = this.getSwfInstance();
			instance.callFlash('StartUpload', file.fileData.id);
			instance.callFlash('ReturnUploadStart', true);

			this.fireEvent({
				type: '@startupload',
				file: file
			});
		},
		swfAbort: function(file){
			if(!file || !file.name){
				return this._throwNoFile();
			}

			var instance = this.getSwfInstance();
			//instance.callFlash('StopUpload');
			instance.callFlash('CancelUpload', file.fileData.id, false);
		},
		swfEnable: function(){
			var instance = this.getSwfInstance();
			instance.callFlash('SetButtonDisabled', false);
			instance.callFlash('SetButtonCursor', this.ops.swfCursor === 'default' ? -1 : -2);
		},
		swfDisable: function(){
			var instance = this.getSwfInstance();
			instance.callFlash('SetButtonCursor', -1);
			instance.callFlash('SetButtonDisabled', true);
		}
	};
	//getFitRemaining
	Uploader.getFitRemaining = function(ms){
		if(!isFinite(ms) || ~~ms < 0){ return '未知'; }
		ms = Math.max(0, parseInt(ms, 10));

		var 
		s = ms / 1000,
		h = ~~(s / 3600),
		m = ~~((s - h*3600) / 60);
		s = (s - (h*3600 + m*60)).toFixed();
		return [h < 10 ? '0'+h : h, m < 10 ? '0'+m : m, s < 10 ? '0'+s : s].join(':');
	};


	//File
	var File = Uploader.File = function(data){
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
		getDom: function(selector){
			if(!this.dom){
				var
				self = this,
				dom = this.dom = $(document.createElement('li')).addClass('ready'),
				html = '<span class="name">{name}</span><div class="progress"><em style="width:0%"></em></div><div class="status"><span>等待上传</span><a href="javascript:;" class="btn reupload hide">重新上传</a><a href="javascript:;" class="btn abort">取消</a></div><div class="props"><span class="type">{extName}</span><span class="size">{fitSize}</span><span class="timer"><i></i>剩余时间<em>00:00:00</em></span><span class="speed">0Kb/s</span></div>';
				dom.html(html.replace(/\{name\}/g, this.name)
					.replace(/\{extName\}/g, this.extName)
					.replace(/\{fitSize\}/g, this.fitSize));
					
				//abort upload
				dom.delegate('a.abort', 'click', function(e){
					e.preventDefault();

					self.uploader && self.uploader.abort(self);
				})
				.delegate('a.reupload', 'click', function(e){
					e.preventDefault();

					self.setState('ready');
					self.uploader && self.uploader.upload(self);
				});
			}
			return selector ? this.dom.find(selector) : this.dom;
		},
		setState: function(status, message){
			var 
			shell = this.getDom(),
			statusElem = this.getDom('.status span').attr('title', message||'');
			shell[0].className = this.status = status;
			switch(status){
				case 'ready':
					this.getDom('.reupload,.abort').addClass('hide');
					statusElem.html('等待上传');
					this.setProgress(0, 0, 0);
					break;
				case 'uploading':
					this.getDom('.abort').removeClass('hide');
					statusElem.html('上传中');
					break;
				case 'success':
					this.getDom('.reupload,.abort,.speed').addClass('hide');
					statusElem.html('<i></i>完成');
					this.setProgress(100, 0, 0);
					this.destroy();
					break;
				case 'error':
					if(this.uploader && this.uploader.support.reupload){
						this.getDom('.reupload').removeClass('hide');
					}
					statusElem.html('<i></i>失败');
					this.setProgress(100, 0, 0);
					break;
				case 'abort':
					this.getDom('.reupload,.abort,.speed').addClass('hide');
					statusElem.html('已取消');
					this.setProgress(100, 0, 0);
					break;
			}
		},
		setProgress: function(progress, speed, remaining){
			this.progress = parseFloat(progress) || 0;
			this.getDom('.progress em').css('width', this.progress.toFixed(2) + '%');
			if(isFinite(speed)){
				this.speed = speed;
				this.getDom('.speed').html(speed >= 0 ? File.getFitSize(speed) + '/s' : '');
			}
			if(isFinite(remaining)){
				this.remaining = remaining;
				this.getDom('.timer em').html(Uploader.getFitRemaining(remaining));
			}
		},
		destroy: function(){
			var shell = this.getDom();
			shell.undelegate();
			this.dom = null;
		}
	};
	$.extend(File, {
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
		}
	});

	//guid
	var _guid = 0;
	function guid(){
		return _guid++;
	}
	
	function mix(target, source, cover){
		for(var k in source){
			if(cover || target[k] === undefined){
				target[k] = source[k];
			}
		}
		return target;
	}

	//阻止冒泡、默认事件
	function stopEvent(e){
		if(!!e){
			e.preventDefault();
			e.stopPropagation();
		}
	}

	return Uploader;
}, this));













/**
* ds.tmpl.js
* create: 2013.01.10
* update: 2013.09.26
* admin@laoshu133.com
**/
;(function(global){var ds=global.ds||(global.ds={});var rarg1=/\$1/g,rgquote=/\\"/g,rbr=/([\r\n])/g,rchars=/(["\\])/g,rdbgstrich=/\\\\/g,rfuns=/<%\s*(\w+|.)([\s\S]*?)\s*%>/g,rbrhash={'10':'n','13':'r'},helpers={'=':{render:'__.push($1);'}};ds.tmpl=function(tmpl,data){var render=new Function('_data','var __=[];__.data=_data;'+'with(_data){__.push("'+tmpl.replace(rchars,'\\$1').replace(rfuns,function(a,key,body){body=body.replace(rbr,';').replace(rgquote,'"').replace(rdbgstrich,'\\');var helper=helpers[key],tmp=!helper?key+body:typeof helper.render==='function'?helper.render.call(ds,body,data):helper.render.replace(rarg1,body);return'");'+tmp+'__.push("';}).replace(rbr,function(a,b){return'\\'+(rbrhash[b.charCodeAt(0)]||b);})+'");}return __.join("");');return data?render.call(data,data):render;};ds.tmpl.helper=helpers;})(this);








/**
* applet.js
* create: 2013.02.20
* update: 2013.02.20
* admin@laoshu133.com
*/
;(function(factory,global){if(typeof define==='function'){define(factory);}else{global.applet=factory();}}(function(){var global=window,navigator=global.navigator;var ieTmpl='<object id="{id}" name="{id}" classid="clsid:8AD9C840-044E-11D1-B3E9-00805F499D93" width="0" height="0" codebase="http://java.sun.com/products/plugin/autodl/jinstall-1_5_0-windows-i586.cab#Version=6,0,0,13"><param name="code" value="FileChooser.class"><object classid="clsid:8AD9C840-044E-11D1-B3E9-00805F499D93" id="UploadPlugInApplet" name="UploadPlugInApplet" width="0" height="0" codebase="http://java.sun.com/products/plugin/autodl/jinstall-1_5_0-windows-i586.cab#Version=6,0,0,13"><param name="code" value="FileChooser.class"><param name="codebase" value="{baseUrl}"><param name="archive" value="FileUpload.jar,plugin.jar"><param name="type" value="application/x-java-applet;version=1.6.0"><param name="scriptable" value="true"><param name="mayscript" value="true"></object>',w3cTmpl='<applet id="{id}" name="{id}" code="FileChooser.class" codebase="{baseUrl}" archive="FileUpload.jar,plugin.jar" width="1" height="1" scriptable="true" mayscript="true" my_param="my_param_value" type="application/x-java-applet;version=1.5.0"></applet>';return{debug:false,platform:navigator.platform,hasActiveXObject:!!global.ActiveXObject,isIE:navigator.userAgent.toUpperCase().indexOf('MSIE')>0,locale:(navigator.language||navigator.systemLanguage||navigator.userLanguage||'').replace('-','_'),getAppletHTML:function(baseUrl,id){var html=(this.hasActiveXObject?ieTmpl:w3cTmpl);return html.replace(/\{baseUrl\}/g,baseUrl).replace(/\{id\}/g,id||'ds_applet_uploader');},getJREVersion:(function(){var _version,_tested=false,_versions=['1.8','1.7','1.6','1.5','1.4.2'],_getFullVersion=function(version){return/\.\d+\./.test(version)?version:version+'.0';},_initTest=function(){var j,tmp,tmpArr,i=0,len=_versions.length;if(!!global.ActiveXObject){for(;i<len;i++){try{new ActiveXObject('JavaWebStart.isInstalled.'+_getFullVersion(_versions[i])+'.0');_version=_getFullVersion(_versions[i]);break;}catch(_){}}}else{for(;i<len;i++){tmpArr=navigator.mimeTypes;tmp=new RegExp('x-java-applet;version='+_versions[i].replace(/\./g,'\\.'));for(j=tmpArr.length-1;j>=0;j--){if(tmp.test(tmpArr[j].type)){_version=_getFullVersion(_versions[i]);break;}}if(!!_version){break;}}}if(!_version&&!!navigator.plugins&&!!(tmpArr=navigator.plugins).length){for(;i<len;i++){tmp=new RegExp('Java.+?'+_versions[i].replace(/\./g,'\\.'));for(j=tmpArr.length-1;j>=0;j--){if(tmp.test(tmpArr[j].description)){_version=_getFullVersion(_versions[i]);break;}}if(!!_version){break;}}}_tested=true;};return function(version){if(!_tested){_initTest();}return version?version.indexOf(_version)===0:_version;};}())};},this));