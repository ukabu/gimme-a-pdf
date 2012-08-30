var page = require('webpage').create(),
    system = require('system'),
    address, output, size;
//console.log('The default user agent is ' + page.settings.userAgent);
//page.settings.userAgent = 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.4 (KHTML, like Gecko) Chrome/22.0.1229.6 Safari/537.4';

if (system.args.length < 3 || system.args.length > 5) {
    console.log('Usage: rasterize.js URL filename [paperwidth*paperheight|paperformat] [zoom]');
    console.log('  paper (pdf output) examples: "5in*7.5in", "10cm*20cm", "A4", "Letter"');
    phantom.exit(1);
} else {
    address = system.args[1];
    output = system.args[2];
    page.viewportSize = { width: 1024, height: 768 };
    if (system.args.length > 3 && system.args[2].substr(-4) === ".pdf") {
        size = system.args[3].split('*');
        page.paperSize = size.length === 2 ? { width: size[0], height: size[1], margin: '0px' }
                                           : { format: system.args[3] || 'Letter', orientation: 'portrait', margin: '1cm' };
    }
    if (system.args.length > 4) {
        page.zoomFactor = system.args[4];
    }
    page.open(address, function (status) {
        if (status !== 'success') {
            console.log('Unable to load the address!');
        } else {
            page.evaluate(function () {
                var links = document.getElementsByTagName('link');
                for (var i = 0, len = links.length; i < len; ++i) {
                    var link = links[i];
                    if (link.rel == 'stylesheet') {
                        if (link.media == 'screen') { link.media = ''; }
                        if (link.media == 'print') { link.media = 'ignore'; }
                    }
                }
            });
            window.setTimeout(function () {
                page.render(output);
                phantom.exit();
            }, 5000);
        }
    });
}
