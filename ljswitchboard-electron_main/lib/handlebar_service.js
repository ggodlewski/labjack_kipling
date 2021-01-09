'use strict';

const fs = require('fs');
const handlebars = require('handlebars');

handlebars.registerHelper('printContext', function() {
    return new handlebars.SafeString(JSON.stringify({'context': this}, null, 2));
});

handlebars.registerHelper('eachDict', function(context, options) {
    let ret = "";
    const data = {};

    for (let name in context) {
        const value = context[name];
        if(value) {
            data.key = name;
            data.info = value;
        }
        ret = ret + options.fn(value, {data: data});
    }
    return ret;
});

handlebars.registerHelper('toJSON', function(obj) {
    return JSON.stringify(obj, null, 3);
});

handlebars.registerHelper('printContext', function() {
    return new handlebars.SafeString(JSON.stringify({'context': this}, null, 2));
});

class HandleBarsService {

    async _loadTemplateFile(templatePath) {
        return fs.readFileSync(templatePath).toString();
    }

    _compileTemplate(html) {
        return handlebars.compile(html);
    }

    async renderTemplate(templatePath, data) {
        const html = await this._loadTemplateFile(templatePath);
        const template = await this._compileTemplate(html);
        return template(data);
    }

    async renderHtmlTemplate(html, data) {
        const template = await this._compileTemplate(html);
        return template(data);
    }

}

exports.handleBarsService = new HandleBarsService();