/**
* jquery.uploader.applet.js
* @create: 2013.11.27
* @update: 2013.11.27
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
		getAppletHTML: function(ops){
			var 
			appletOptions = mix(this.ops.appletOptions || {}, Uploader.defaultOptions.appletOptions),
			tmpl = this.hasActiveXObject ? '<object id="{id}" name="{id}" class="{className}" style="{cssText}" width="{width}" height="{height}" codebase="{codebase}" classid="clsid:8AD9C840-044E-11D1-B3E9-00805F499D93"><param name="code" value="{code}"><param name="codebase" value="{codebase}"><param name="archive" value="{archive}"><param name="type" value="application/x-java-applet;version={version}"><param name="scriptable" value="true"><param name="mayscript" value="true" /></object>' : '<applet id="{id}" name="{id}" class="ds_appletuploader" style="{cssText}" codebase="{codebase}" code="{code}" archive="{archive}" width="{width}" height="{height}" scriptable="true" mayscript="true" type="application/x-java-applet;version={version}"></applet>';

			appletOptions.id = this.appletUploaderId;
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
					callApplet: function(name, arg1, arg2, arg3){
						var ret, elem, args;
						try{
							elem = document.getElementById(self.appletUploaderId);
							ret = elem.CallFunction(name, arg1, arg2, arg3);
						}
						catch(ex){
							self.fire('error', {
								type: 'callapplet',
								message: ex.message
							});
						}
						return ret;
					},
					addFile: function(file){
						self.add(file);
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
				api.ready = function(){
					self.appletEnable();
					self.fireEvent({
						type: '@ready',
						uploadType: 'applet'
					}, support);

					//only ready once
					api.ready = noop;
				};

				//be safe for load error
				this.addListener('error', function(e, data){
					if(data && data.type === 'load' && data.uploadType === 'applet'){
						this.removeListener('error', arguments.callee);

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
	
	//Extend options
	var 
	defaultOptions = Uploader.defaultOptions,
	typeOrder = defaultOptions.typeOrder;
	typeOrder[typeOrder.length - 1] = 'applet';
	typeOrder[typeOrder.length] = 'iframe';
	defaultOptions.appletOptions = {
		archive: 'Uploader.jar',
		code: 'Uploader.class',
		codebase: './',
		version: '1.6.0',
		cssText: 'position:absolute;visibility:hidden',
		height: 1,
		width: 1
	};
}, this));