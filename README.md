# Status of gnome15

> In fact gnome15 is dead - original authors are gone and everybody is making it on their own

I'm trying to fix bugs and more. Just to be able use G510 keyboard on Ubuntu 14 and up.
I'm doing that on my own. It's a lot of work.

# The plan

- [x] Run on Gnome3
- [x] Install tutorial
- [ ] [Code of migration from GConf to GSettings](https://developer.gnome.org/gio/unstable/ch34.html)
- [ ] GTK+ 3
- [ ] Make code more clear
- [ ] Write documentation
- [ ] And more

---
#### Old info

Gnome15 is currently **not complete maintained**.
The original primary repository has been unavailable since November 2014 due to a hosting server crash.
This fork was made to add a feature and has not been updated since November 2013, but it appears to be the latest snapshot of the repository that is currently publicly available.

I intend to bring this repository up to date with the latest version (the version before the server crash) using the code contained in the latest distribution packages available.
We want to maintain it, so many we can. Feel free to work with.

#### Gnome15

A set of tools for configuring the Logitech G15 keyboard.

Contains pylibg19, a library providing support for the Logitech G19 until there
is kernel support available. It was based "Logitech-G19-Linux-Daemon" [1],
the work of "MultiCoreNop" [2].

1. http://github.com/MultiCoreNop/Logitech-G19-Linux-Daemon
2. http://github.com/MultiCoreNop

---

# Installation

## Prerequisites

- libtoolize
- autoconf / automake
- uinput
- Python
- PyUSB
- and more...

> I'm user of ubuntu - for us is simple tut how to install it

### Install

1. Install deps by apt
2. Install missing deps from pip
3. Checkout project from github
4. Let automake do it's job
5. Compile and install
6. Use


#### apt

```
apt-get install libtoolize autoconf udev python-virtkey python-keyring python-gtk2 python-gtk2-dev pip python-usb python-rsvg libudev-dev python-wnck python-pil
```

#### pip

```
pip install inotify python-uinput gconf
```

#### Checkout

> this you should run in some dir like ```/usr/local/src/``` (just info for beginners)

```
git clone https://github.com/petrleocompel/gnome15.git

cd gnome15
```

#### Automake

```
libtoolize
aclocal
autoconf
automake --add-missing
automake
```

> All these automake commands can be replaced by

```
autoreconf --install
```

#### Configure, compile and install

Configure has a lot of options to see all options run
```
./configure --help
```

For basic config use
```
./configure
```

My configuration is this - Because I have G510
```
./configure --enable-driver-g15direct
```

And last is make and make install
```
make
make install
```

#### Use

Now you should be able to use g keys and config them

> I recommend do a reboot to be sure <br> uinput has to be loaded and so long... (or run ```modprobe uinput```)

You can run g15-config for configuration or by running it in your apps menu

# Bugs

Issues can be submitted on the [github](https://github.com/petrleocompel/gnome15/issues)

> This is not my main project so don't expect any ETA and so long..

That's all the folks ! :blush:
