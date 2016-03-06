//  Gnome15 - Suite of tools for the Logitech G series keyboards and headsets
//  Copyright (C) 2012 Brett Smith <tanktarta@blueyonder.co.uk>
//  Copyright (C) 2013 Brett Smith <tanktarta@blueyonder.co.uk>
//                     Nuno Araujo <nuno.araujo@russo79.com>
//
//  This program is free software: you can redistribute it and/or modify
//  it under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version.
//
//  This program is distributed in the hope that it will be useful,
//  but WITHOUT ANY WARRANTY; without even the implied warranty of
//  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//  GNU General Public License for more details.
//
//  You should have received a copy of the GNU General Public License
//  along with this program.  If not, see <http://www.gnu.org/licenses/>.

/*
 * Gnome15 - The Logitech Keyboard Manager for Linux
 *
 * This GNOME Shell extension allows control of all supported and connected
 * Logitech devices from the shell's top panel. A menu button is added for
 * each device, providing options to enable/disable the device, enable/disable
 * screen cycling, and make a particular page the currently visible one.
 */

const St = imports.gi.St;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const Lang = imports.lang;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Clutter = imports.gi.Clutter;
const Config = imports.misc.config;

let currNotification, gnome15Service, devices, dbus_watch_id;

/*
 * Remote object definitions. This is just a sub-set of the full API 
 * available, just enough to do the job
 */ 

const Gnome15ServiceInterface = '<node>\
<interface name="org.gnome15.Service">\
<method name="GetDevices">\
	<arg type="as" direction="out"/>\
</method>\
<method name="GetScreens">\
	<arg type="as" direction="out"/>\
</method>\
<method name="GetServerInformation">\
	<arg type="s" direction="out" name="name"/>\
	<arg type="s" direction="out" name="vendor"/>\
	<arg type="s" direction="out" name="version"/>\
	<arg type="s" direction="out" name="spec_version"/>\
</method>\
<method name="IsStarted">\
	<arg type="b" direction="out"/>\
</method>\
<method name="IsStarting">\
	<arg type="b" direction="out"/>\
</method>\
<method name="IsStopping">\
	<arg type="b" direction="out"/>\
</method>\
<method name="Stop"/>\
<signal name="ScreenAdded">\
	<arg type="s" name="screen_name"/>\
</signal>\
<signal name="ScreenRemoved">\
	<arg type="s" name="screen_name"/>\
</signal>\
<signal name="DeviceAdded">\
	<arg type="s" name="device_name"/>\
</signal>\
<signal name="DeviceRemoved">\
	<arg type="s" name="device_name"/>\
</signal>\
<signal name="Started"/>\
<signal name="Starting"/>\
<signal name="Stopped"/>\
<signal name="Stopping"/>\
</interface>\
</node>';



const Gnome15ScreenInterface = '<node>\
<interface name="org.gnome15.Screen">\
<method name="GetPages">\
	<arg type="as" direction="out" />\
</method>\
<method name="IsConnected">\
	<arg type="b" direction="out" />\
</method>\
<method name="GetDriverInformation">\
	<arg type="s" direction="out" name="name"/>\
	<arg type="s" direction="out" name="model_name"/>\
	<arg type="n" direction="out" name="xres"/>\
	<arg type="n" direction="out" name="yres"/>\
	<arg type="n" direction="out" name="bpp"/>\
</method>\
<method name="IsCyclingEnabled">\
	<arg type="b" direction="out" />\
</method>\
<method name="SetCyclingEnabled">\
	<arg type="b" direction="in" name="enabled"/>\
</method>\
<method name="Cycle">\
	<arg type="i" direction="in" name="cycle"/>\
</method>\
<method name="CycleKeyboard">\
	<arg type="i" direction="in" name="value"/>\
</method>\
<signal name="PageCreated">\
	<arg type="s" name="page_path"/>\
	<arg type="s" name="title"/>\
</signal>\
<signal name="PageDeleted">\
	<arg type="s" name="page_path"/>\
</signal>\
<signal name="PageDeleting">\
	<arg type="s" name="page_path"/>\
</signal>\
<signal name="PageChanged">\
	<arg type="s" name="page_path"/>\
</signal>\
<signal name="PageTitleChanged">\
	<arg type="s" name="page_path"/>\
	<arg type="s" name="new_title"/>\
</signal>\
<signal name="Connected">\
	<arg type="s" name="driver_name"/>\
</signal>\
<signal name="Disconnected">\
	<arg type="s" name="driver_name"/>\
</signal>\
<signal name="CyclingChanged">\
	<arg type="b" name="cycle"/>\
</signal>\
</interface>\
</node>';

/* No idea why, but Cycle and CycleKeyboard signatures argument type are actually 'n',
 * but this causes an exception when calling with JavaScript integer.
 */

const Gnome15DeviceInterface = '<node>\
<interface name="org.gnome15.Device">\
<method name="GetScreen">\
	<arg type="s" direction="out" />\
</method>\
<method name="GetModelFullName">\
	<arg type="s" direction="out" />\
</method>\
<method name="GetUID">\
	<arg type="s" direction="out" />\
</method>\
<method name="GetModelId">\
	<arg type="s" direction="out" />\
</method>\
<method name="Enable"/>\
<method name="Disable"/>\
<signal name="ScreenAdded">\
	<arg type="s" name="screen_name"/>\
</signal>\
<signal name="ScreenRemoved">\
	<arg type="s" name="screen_name"/>\
</signal>\
</interface>\
</node>';

const Gnome15PageInterface = '<node>\
<interface name="org.gnome15.Page">\
<method name="GetTitle">\
	<arg type="s" direction="out" />\
</method>\
<method name="GetId">\
	<arg type="s" direction="out" />\
</method>\
<method name="CycleTo"/>\
</interface>\
</node>';

/**
 * Instances of this class are responsible for managing a single device.
 * A single button is created and added to the top panel, various attributes
 * about the device attached are read, and if the device currently has
 * a screen (i.e. is enabled), the initial page list is loaded. 
 * 
 * Signals are also setup to watch for the screen being enable / disabled
 * externally.
 */
const DeviceItem = new Lang.Class({
    Name: 'DeviceItem',
	_init : function(key) {
		this.parent();
		this._buttonSignals = new Array();
		let gnome15Device = _createDevice(key);
		gnome15Device.GetModelFullNameRemote(Lang.bind(this, function(result) {
			let [modelFullName] = result;
			gnome15Device.GetModelIdRemote(Lang.bind(this, function(result) {
				let [uid] = result;
				gnome15Device.GetScreenRemote(Lang.bind(this, function(result) {
					let [screen] = result;
					gnome15Device.connectSignal("ScreenAdded", Lang.bind(this, function(src, senderName, args) {
						let [screenPath] = args;
						_log("Screen added " + screenPath);
						this._getPages(screenPath);
					}));
					gnome15Device.connectSignal("ScreenRemoved", Lang.bind(this, function(src, senderName, args) {
						let [screenPath] = args;
						_log("Screen removed " + screenPath);
						this._cleanUp();
						this._gnome15Button.clearPages();
					}));
					this._addButton(key, modelFullName, uid, screen);
				}));
			}));
		}));
	},
	
	_addButton: function(key, modelFullName, modelId, screen) {
		let hasScreen = screen != null && screen.length > 0;
		this._gnome15Button = new DeviceButton(key, modelId, modelFullName, hasScreen);

		if(Config.PACKAGE_VERSION.indexOf("3.4") == 0) {
			Main.panel._rightBox.insert_child_at_index(this._gnome15Button.actor, 1);
			Main.panel._rightBox.child_set(this._gnome15Button.actor, {
				y_fill : true
			});
			Main.panel._menus.addMenu(this._gnome15Button.menu);
		}
		else if(Config.PACKAGE_VERSION.indexOf("3.10") == 0) {
			Main.panel.addToStatusArea('gnome15-' + modelId, this._gnome15Button);
		}
		else {
			Main.panel.addToStatusArea('gnome15-' + modelId, this._gnome15Button);
			Main.panel.menuManager.addMenu(this._gnome15Button.menu);
		}
		
		if(hasScreen) {
			/* If this device already has a screen (i.e. is enabled, load the
			 * pages now). Otherwise, we wait for ScreenAdded to come in
			 * in extension itself
			 */
			this._getPages(screen);
		}
		else {
			this._gnome15Button.reset();	
		}
	},
	
	/**
	 * Removes the signals that are being watched for this device and 
	 * mark the button so that the enabled switch is turned off when
	 * the menu is reset 
	 */
	_cleanUp: function() {
		if(this._gnome15Button._screen != null) {
			for(let key in this._buttonSignals) {
				this._gnome15Button._screen.disconnectSignal(this._buttonSignals[key]);
			}
			this._buttonSignals.splice(0, this._buttonSignals.length);
			this._gnome15Button._screen = null;
		}
	},
	
	/**
	 * Callback that receives the full list of pages currently showing on
	 * this device and adds them to the button. It then starts watching for
	 * new pages appearing, or pages being deleted and acts accordingly.
	 */
	_getPages: function(screen) {
		this._cleanUp();
		this._gnome15Button._screen = _createScreen(screen);
		this._gnome15Button._screen.GetPagesRemote(Lang.bind(this, function(result) {
			let [pages] = result;
			this._gnome15Button.clearPages();
			for(let key in pages) {
		        this._gnome15Button.addPage(pages[key]);
			}
			this._gnome15Button._screen.IsCyclingEnabledRemote(Lang.bind(this, function(result) {
				let [cyclingEnabled] = result;
				this._gnome15Button.setCyclingEnabled(cyclingEnabled);
				this._buttonSignals.push(this._gnome15Button._screen.connectSignal("PageCreated", Lang.bind(this, function(src, senderName, args) {
					let pagePath = args[0];
					this._gnome15Button.addPage(pagePath);
				})));
				this._buttonSignals.push(this._gnome15Button._screen.connectSignal("PageDeleting", Lang.bind(this, function(src, senderName, args) {
					let pagePath = args[0];
					this._gnome15Button.deletePage(pagePath);
				})));
				this._buttonSignals.push(this._gnome15Button._screen.connectSignal("CyclingChanged", Lang.bind(this, function(src, senderName, args) {
					let [cycle] = args;
					this._gnome15Button.setCyclingEnabled(cycle);
				})));
			}));			
		}));
		
		
	},
	
	/**
	 * Called as a result of the service disappearing or the extension being
	 * disabled. The button is removed from the top panel.
	 */
	close : function(pages) {
		this._gnome15Button.destroy();
	}
});

/**
 * A switch menu item that allows a single device to be enabled or disabled.
 */
const EnableDisableMenuItem = new Lang.Class({
    Name: 'EnableDisableMenuItem',
    Extends: PopupMenu.PopupSwitchMenuItem,

	_init : function(devicePath, modelName, screen) {
		this.parent(modelName);
		this.setToggleState(screen != null);
		this.connect('toggled', Lang.bind(this, function() {
			if(this.state) {
				_createDevice(devicePath).EnableRemote();
			}
			else {
				_createDevice(devicePath).DisableRemote();
			}
		}));
	},

	activate : function(event) {
		this.parent(event);
	},
});

/**
 * A switch menu item that allows automatic page cycling to be enabled or
 * disabled.
 */
const CyclePagesMenuItem = new Lang.Class({
    Name: 'CyclePagesMenuItem',
    Extends: PopupMenu.PopupSwitchMenuItem,

	_init : function(selected, screen) {
		this.parent("Cycle pages automatically");
		this.setToggleState(selected);
		this._screen = screen;
	},

	activate : function(event) {
		this._screen.SetCyclingEnabledRemote(!this.state);
		this.parent(event);
	},
});

/**
 * A menu item that represents a single page on a single device. Activating
 * this item causes the page to be displayed. 
 */
const PageMenuItem = new Lang.Class({
    Name: 'PageMenuItem',
    Extends: PopupMenu.PopupBaseMenuItem,

	_init : function(lblText, lblId, page_proxy) {
		this.parent();
		this.label = new St.Label({
			text : lblText
		});
		if(Config.PACKAGE_VERSION.indexOf("3.10") == 0) {
			this.actor.add_child(this.label);
		}
		else {
			this.addActor(this.label);
		}
		this._pageProxy = page_proxy;
		this._text = lblText;
		this._idTxt = lblId;
	},

	activate : function(event) {
		this._pageProxy.CycleToRemote();
		this.parent(event);
	},
});

/**
 * A menu item that that activates g15-config. It will open with provided
 * device UID open (via the -d option of g15-config). 
 */
const PreferencesMenuItem = new Lang.Class({
    Name: 'PreferencesMenuItem',
    Extends: PopupMenu.PopupMenuItem,

	_init : function(deviceUid) {
		this.parent("Configuration");
		this._deviceUid = deviceUid
	},

	activate : function(event) {
        GLib.spawn_command_line_async('g15-config -d ' + this._deviceUid);
        this.parent(event);
	},
});

/**
 * Shell top panel button that represents a single Gnome15 device.
 */
const DeviceButton = new Lang.Class({
    Name: 'DeviceButton',
    Extends: Config.PACKAGE_VERSION.indexOf("3.10") == 0 ? PanelMenu.Button : PanelMenu.SystemStatusButton,
	NUMBER_OF_FIXED_MENU_ITEMS: 4,

	_init : function(devicePath, modelId, modelName) {
		this._deviceUid = devicePath.substring(devicePath.lastIndexOf('/') + 1);
		this._itemMap = {};
		
		if(Config.PACKAGE_VERSION.indexOf("3.4") == 0) {
			this.parent('logitech-' + modelId);
		}
		else if(Config.PACKAGE_VERSION.indexOf("3.10") == 0) {
			this.parent(0.0, 'logitech-' + modelId + '-symbolic');
		}
		else {
			this.parent('logitech-' + modelId + '-symbolic');
		}
		
		this._cyclingEnabled = false;
		this._devicePath = devicePath;
		this._itemList = new Array();
		this._modelId = modelId;
		this._modelName = modelName;
		this._screen = null;
		if(Config.PACKAGE_VERSION.indexOf("3.4") == 0) {
			this._iconActor.add_style_class_name('device-icon');
			this._iconActor.set_icon_size(20);
			this._iconActor.add_style_class_name('device-button');
		}
		else if (Config.PACKAGE_VERSION.indexOf("3.10") == 0) {
			this._icon = new St.Icon({
					icon_name: 'logitech-' + modelId + '-symbolic',
					style_class: 'device-icon',
					reactive: true,
					track_hover: true
				});
			this._icon.set_icon_size(20);
			this._icon.add_style_class_name('device-button');
			this.actor.add_actor(this._icon);
                }
		else {
			this.mainIcon.add_style_class_name('device-icon');
			this.mainIcon.set_icon_size(20);
			this.mainIcon.add_style_class_name('device-button');
		}
        
        // Mouse whell events
        this.actor.connect('scroll-event', Lang.bind(this, this._onScrollEvent));
	},
	
	/**
	 * Set whether cycling is enabled for this device
	 * 
	 * @param cycle enable cycling
	 */
	setCyclingEnabled: function(cycle) {
		this._cyclingEnabled = cycle;
		this.reset();
	},

	/**
	 * Remove the menu item for a page given it's path.
	 * 
	 * @param pagePath path of page
	 */
	deletePage: function(pagePath) {
		let idx = this._itemList.indexOf(pagePath);
		if(idx != -1) {
			this._itemList.splice(idx, 1);
			this._itemMap[pagePath].destroy();
			delete this._itemMap[pagePath];
		}
	},

	/**
	 * Clear all pages from this menu.
	 */
	clearPages : function() {
		this._itemList = new Array();
		this.reset();
	},

	/**
	 * Add a new page to the menu given it's path.
	 * 
	 * @param pagePath page of page to add
	 */
	addPage : function(pagePath) {
		this._addPage(pagePath, true);
	},

	/**
	 * Rebuild the entire menu. 
	 */
	reset : function() {
		this.menu.removeAll();
		this.menu.addMenuItem(new EnableDisableMenuItem(this._devicePath, this._modelName, this._screen));
		this.menu.addMenuItem(new CyclePagesMenuItem(this._cyclingEnabled, this._screen));
		this.menu.addMenuItem(new PreferencesMenuItem(this._deviceUid));
		this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
		for (let key in this._itemList) {
			this._addPage(this._itemList[key]);
		}
	},
	
	/**
	 * Add the menu items for a single page given it's page. Various attributes
	 * about the page are read via dbus and the menu item constructed and
	 * added to the menu component.
	 * 
	 * @param pagePath page of page.
	 * @param insertPagePathInItemList flag that specifies if the pagePath should be inserted in
	 *                                 the _itemList. Should be set to true when adding a page
	 *                                 for the first time.
	 */
	_addPage : function(pagePath, insertPagePathInItemList) {
		let Gnome15PageProxy = Gio.DBusProxy.makeProxyWrapper(Gnome15PageInterface);
		let pageProxy = new Gnome15PageProxy(Gio.DBus.session, 'org.gnome15.Gnome15', pagePath);
		pageProxy.GetTitleRemote(Lang.bind(this, function(result) {
			let [title] = result;
			let item = new PageMenuItem(title, title, pageProxy);
			let position = this._findMenuPositionFor(item);
			if(insertPagePathInItemList == true)
				this._itemList.splice(position, 0, pagePath);
			this._itemMap[pagePath] = item;
			this.menu.addMenuItem(item, position + this.NUMBER_OF_FIXED_MENU_ITEMS);
		}));
	},

	/**
	 * Find the position where a given menu item must be inserted in the menu so that
	 * all the items are alphabetically ordered.
	 *
	 * @param item item that will be inserted in the menu
	 */
	_findMenuPositionFor : function(item) {
		let i = 0;
		for(let key in this._itemList) {
			let pagePath = this._itemList[key];
			if(this._itemMap[pagePath]._text > item._text)
				return i;
			i++;
		}
		return this._itemList.length;
	},
	
	/**
	 * Handle mouse wheel events by cycling pages.
	 * 
	 * @param actor source of event
	 * @param event event
	 */
	_onScrollEvent: function(actor, event) {
        let direction = event.get_scroll_direction();
        if(this._screen != null) {
	        if (direction == Clutter.ScrollDirection.DOWN) {
	        	this._screen.CycleRemote(-1);
	        }
	        else if (direction == Clutter.ScrollDirection.UP) {
	        	this._screen.CycleRemote(1);
	        }
	        if (direction == Clutter.ScrollDirection.LEFT) {
	        	this._screen.CycleKeyboardRemote(-1);
	        }
	        else if (direction == Clutter.ScrollDirection.RIGHT) {
	        	this._screen.CycleKeyboardRemote(1);
	        }
        }
    },
});

/*
 * GNOME Shell Extension API functions
 */

function init() {
	_log('Loading Gnome15 Gnome Shell Extension')
	devices = {}
	let Gnome15ServiceProxy = Gio.DBusProxy.makeProxyWrapper(Gnome15ServiceInterface);
	
	/* The "Service" is the core of Gnome, so connect to it and watch for some
	 * signals
	 */
	gnome15Service = new Gnome15ServiceProxy(Gio.DBus.session,
			'org.gnome15.Gnome15',
			'/org/gnome15/Service');

	gnome15Service.connectSignal("Started", _onDesktopServiceStarted);
	gnome15Service.connectSignal("Stopping", _onDesktopServiceStopping);
	gnome15Service.connectSignal("DeviceAdded", _deviceAdded);
	gnome15Service.connectSignal("DeviceRemoved", _deviceRemoved);
}

function enable() {
	_log('Enabling Gnome15 Gnome Shell Extension')
	dbus_watch_id = Gio.bus_watch_name(Gio.BusType.SESSION,
	                                   'org.gnome15.Gnome15',
	                                   Gio.BusNameWatcherFlags.NONE,
	                                   _onDesktopServiceAppeared,
	                                   _onDesktopServiceVanished);

	gnome15Service.IsStartedRemote(_onStarted);
}

function disable() {
	_log('Disabling Gnome15 Gnome Shell Extension')
	for(let key in devices) {
		_removeDevice(key);
	}
	Gio.bus_unwatch_name(dbus_watch_id);
}

/*
 * Private functions
 */

/**
 * Callback invoked when the DBus name owner changes (added). We don't actually care
 * about this one as we load pages on other signals
 */
function _onDesktopServiceAppeared() {
}

/**
 * Callback invoked when the DBus name owner changes (removed). This occurs
 * when the service disappears, even when it dies unexpectedly. 
 */
function _onDesktopServiceVanished() {
	_log('Desktop service vanished');
	_onDesktopServiceStopping();
}

/**
 * Callback invoked when the Gnome15 service starts. We get the initial device
 * list at this point. 
 */
function _onDesktopServiceStarted() {
	_log('Desktop service started');
	gnome15Service.GetDevicesRemote(_refreshDeviceList);
}

/**
 * Invoked when the Gnome15 desktop service starts shutting down (as a result
 * of user selecting "Stop Service" most probably).
 */
function _onDesktopServiceStopping() {
	_log('Desktop service stopping');
	for(let key in devices) {
		_removeDevice(key);
	}
}

/**
 * Callback from IsStarted called during initialisation.
 */
function _onStarted(result, excp) {
	/* If there was an exception (e.g. g15-desktop-service isn't running) we
       return. started value is null in this case                             */
	if(excp) {
		return;
	}

	let [started] = result;
	if(started) {
		gnome15Service.GetDevicesRemote(_refreshDeviceList);
	}
}

/**
 * Callback from GetDevicesRemote that reads the returned device list and
 * creates a button for each one.
 */
function _refreshDeviceList(result) {
	let [devices] = result;
	for (let key in devices) {
		_addDevice(devices[key]);
	}
}

/**
 * Gnome15 doesn't yet send DBus events when devices are hot-plugged, but it
 * soon will and this function will add new device when they appear.
 * 
 * @param source device source (may be null)
 * @param key device DBUS object path
 */
function _deviceAdded(source, senderName, args) {
	let [key] = args;
	_addDevice(key);
}


function _addDevice(key) {
	_log('Added device ' + key);
	devices[key] = new DeviceItem(key);
}

/**
 * Gnome15 doesn't yet send DBus events when devices are hot-plugged, but it
 * soon will and this function will add new device when they are removed.
 * 
 * @param source device source (may be null)
 * @param key device DBUS object path
 */
function _deviceRemoved(source, senderName, args) {
	let [key] = args;
	_removeDevice(key);
}

function _removeDevice(key) {
	_log('Removed device ' + key);
	devices[key].close();
	delete devices[key];
}

/**
 * Utility for creating a org.gnome15.Screen instance given it's path.
 * 
 * @param path
 * @returns {Gnome15ScreenProxy}
 */
function _createScreen(path) {
	let Gnome15ScreenProxy = Gio.DBusProxy.makeProxyWrapper(Gnome15ScreenInterface);
	return new Gnome15ScreenProxy(Gio.DBus.session,
			'org.gnome15.Gnome15', path);
}

/**
 * Utility for creating an org.gnome15.Device instance given it's path.
 * 
 * @param path
 * @returns {Gnome15DeviceProxy}
 */
function _createDevice(path) {
	let Gnome15DeviceProxy = Gio.DBusProxy.makeProxyWrapper(Gnome15DeviceInterface);
	return new Gnome15DeviceProxy(Gio.DBus.session,
			'org.gnome15.Gnome15', path);
}

/**
 * Utility for logging messages
 *
 * @param message
 */
function _log(message) {
  global.log('gnome15-gnome-shell: ' + message)
}
