/**
* jquery.uploader.applet.js
* @create: 2013.11.27
* @update: 2013.12.02
* admin@laoshu133.com
*
* @deps jquery.uploader.js
*/
;(function(factory, global){
	if(typeof define === 'function'){
		define(['jquery.uploader'], factory);
	}
	else{
		factory();
	}
}(function(Uploader){
	!Uploader && (Uploader = ds.Uploader);

	var 
	$ = jQuery,
	global = window,
	mix = Uploader.mix,
	fill = Uploader.fill;

	mix(Uploader.prototype, {
		hasActiveXObject: global.ActiveXObject !== void 0,
		getAppletVersion: function(){
			var 
			mimeTypes = navigator.mimeTypes,
			testVersions = ['1.4.2', '1.5', '1.6', '1.7', '1.8'],
			tester = !this.hasActiveXObject ? function(ver){
				return !!mimeTypes['application/x-java-applet;version='+ ver];
			} : function(ver){
				var ret = false;
				try{
					ver = (/\.\d+\./.test(ver) ? ver : ver + '.0') + '.0';
					ret = !!new ActiveXObject('JavaWebStart.isInstalled.' + ver);
				}
				catch(_){}
				return ret;
			};
			for(var i = testVersions.length-1; i>=0; i--){
				if(tester(testVersions[i])){
					return testVersions[i];
				}
			}
			return 0;
		},
		getAppletHTML: function(){
			var 
			ops = this.ops,
			appletOptions = mix(ops.appletOptions || {}, Uploader.defaultOptions.appletOptions),
			tmpl = this.hasActiveXObject ? '<object id="{id}" name="{id}" class="ds_appletuploader" style="{cssText}" width="{width}" height="{height}" codebase="{codebase}" classid="clsid:8AD9C840-044E-11D1-B3E9-00805F499D93"><param name="code" value="{code}"><param name="codebase" value="{codebase}"><param name="archive" value="{archive}"><param name="type" value="application/x-java-applet;version={version}"><param name="scriptable" value="true"><param name="mayscript" value="true" /><param name="appletvars" value="{appletvars}" /></object>' : '<applet id="{id}" name="{id}" class="ds_appletuploader" style="{cssText}" codebase="{codebase}" code="{code}" archive="{archive}" width="{width}" height="{height}" scriptable="true" mayscript="true" type="application/x-java-applet;version={version}"><param name="appletvars" value="{appletvars}" /></applet>';

			mix(appletOptions, {
				id: this.appletUploaderId,
				action: ops.action,
				multiple: ops.multiple,
				maxFileCount: ops.maxFileCount,
				maxFileSize: ops.maxFileSize,
				allowExts: ops.allowExts
			}, true);
			appletOptions.appletvars = stringifyJSON(appletOptions).replace(/"/g, '&quot;');
			//appletOptions.id = this.appletUploaderId;
			return fill(tmpl, appletOptions);
		},
		getAppletAPI: function(){
			var 
			self = this,
			AppletAPI = global.AppletUploader || (global.AppletUploader = {}),
			instances = AppletAPI.instances || (AppletAPI.instances = {}),
			api = instances[this.appletUploaderId];
			if(!api){
				api = instances[this.appletUploaderId] = {
					getFile: function(fileData){
						var ret = null;
						fileData && self.eachQueue(function(file){
							if(!file.dataId){
								file.dataId = file.fileData.id;
							}
							if(file.dataId === fileData.id){
								ret = file;
								return false;
							}
						});
						return ret;
					},
					callApplet: function(name, args){
						var ret, elem;
						try{
							elem = document.getElementById(self.appletUploaderId);
							ret = elem.CallFunction(name, stringifyJSON(args));
						}
						catch(ex){
							self.fireEvent('error', {
								type: 'callapplet',
								message: ex.message
							});
						}
						return ret;
					},
					addFile: function(file){
						self.add(file);
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
						var file = this.getFile(fileData);
						file.result = data;

						self.fireEvent({
							type: '@upload',
							result: file.result || '',
							file: file
						});
					},
					uploadError: function(fileData, errCode, errMsg){
						var 
						file = this.getFile(fileData),
						errMsgHash = {'-200':'Http error','-210':'Missing upload url','-220':'IO error','-230':'Security error','-240':'Upload limit exceeded','-250':'Upload failed','-260':'Specified file id not found','-270':'File validation failed','-280':'File cancelled','-290':'Upload stopped','-300':'Resize'};

						file.errorMessage = errMsgHash[errCode] || errMsg;
						file.errorCode = errCode;

						self.fireEvent({
							type: '@uploaderror',
							message: file.errorMessage,
							file: file
						});
					}
				};
			}
			return api;
		},
		initAppletUploader: function(){
			var support = {
				enabled: !!this.getAppletVersion()
			};
			if(support.enabled){
				this.appletUploaderId = 'ds_uploader_applet_' + this.id;
				this.appletPanel = $(this.ops.appletPanel);
				if(!this.appletPanel.length){
					this.appletPanel = this.panel;
				}

				var self = this, api = this.getAppletAPI();
				this.input.addClass('hide');
				api.ready = function(){
					self.appletEnable();
					self.appletPanel.bind('click', function(){
						var ops = self.ops;
						if(!self.disabled){
							api.callApplet(!ops.multiple || ops.maxFileCount === 1 ? 'chooseFile' : 'chooseFiles');
						}
					});

					self.fireEvent({
						type: '@ready',
						uploadType: 'applet'
					}, support);

					//only ready once
					api.ready = $.noop;
				};

				//be safe for load error
				this.addListener('error', function(e, data){
					if(data && data.type === 'load' && data.uploadType === 'applet'){
						this.removeListener('error', arguments.callee);

						self.input.removeClass('hide');
						this.appletDestroy();
					}
				});

				var div = document.createElement('div');
				div.innerHTML = this.getAppletHTML();
				this.appletPanel.append(div.firstChild);
			}
			else{
				this.fireEvent({
					type: '@ready',
					uploadType: 'applet'
				}, support);
			}
		},
		appletUpload: function(file){
			if(!file || !file.name){
				return this._throwNoFile();
			}

			var api = this.getAppletAPI();
			api.callApplet('startUpload', {fileId:file.fileData.id});

			this.fireEvent({
				type: '@startupload',
				file: file
			});
		},
		appletAbort: function(file){
			if(!file || !file.name){
				return this._throwNoFile();
			}

			var api = this.getAppletAPI();
			api.callApplet('cancelUpload', {fileId:file.fileData.id});
		},
		appletEnable: function(){
			this.getAppletAPI().callApplet('enable');
		},
		appletDisable: function(){
			this.getAppletAPI().callApplet('disable');
		},
		appletDestroy: function(){
			try{
				delete AppletUploader.instances[this.appletUploaderId];
				this.getAppletAPI().callApplet('destroy');

				//Private: removes fuctions to prevent memory leaks in IE.
				var k, elem = document.getElementById(this.appletUploaderId);
				for(k in elem){
					if(typeof elem[k] === 'function'){
						elem[k] = null;
					}
				}
				elem.parentNode.removeChild(elem);
			}
			catch(_){}
		}
	});
	
	//Funs
	function stringifyJSON(obj){
		if(global.JSON){
			return JSON.stringify(obj);
		}
		var k, tmp, type, val, ret = String(obj);
		if(obj && typeof obj === 'object'){
			ret = '{';
			for(k in obj){
				val = obj[k];
				type = typeof val;
				if(obj.hasOwnProperty(k) && typeof val !== 'function'){
					tmp = val === null || type === 'number' ? '' : '"';
					ret += '"'+ k + '":' + tmp + val + tmp;
					ret += ',';
				}
			}
			ret = ret.length > 1 ? ret.slice(0, -1) : ret;
			ret += '}';
		}
		return ret;
	}

	//Extend options
	var 
	defaultOptions = Uploader.defaultOptions,
	typeOrder = defaultOptions.typeOrder;
	typeOrder[typeOrder.length - 1] = 'applet';
	typeOrder[typeOrder.length] = 'iframe';
	defaultOptions.appletOptions = {
		archive: 'uploader.jar',
		code: 'Uploader.class',
		codebase: './',
		version: '1.6.0',
		cssText: 'position:absolute',
		height: 1,
		width: 1
	};
}, this));