# whatsmyip
This is a simple PHP script to return your true external ip address, it even works around proxies. This was forked from [Testo Development's script](https://github.com/TestoEXE/whatsmyip).

I have enhanced the original script by allowing an additional format specifier. By default an html version of your IP address will be displayed on your screen. This is formated to be large on both desktop and mobile devices. I have no idea if the CSS is valid as I find CSS to be voodoo, so any suggestions of improvements would be welcome. Other formats available are text and JSON.

## Example usage

### html format
* https://example.org
* https://example.org/?format=html

### text format
* https://example.org/?format=text

### json format
* https://example.org/?format=json

You can see the script in action at [https://ip.paulg.it](https://ip.paulg.it)
