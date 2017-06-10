require('dotenv').config();
const RtmClient = require('@slack/client').RtmClient;
const WebClient = require('@slack/client').WebClient;
const RTM_EVENTS = require('@slack/client').RTM_EVENTS;
const VisualRecognitionV3 = require('watson-developer-cloud/visual-recognition/v3');
const LanguageTranslatorV2 = require('watson-developer-cloud/language-translator/v2');
const fs = require('fs');
const request = require('request');
const path = require('path');

const rtm = new RtmClient(process.env.SLACK_TOKEN);
const web = new WebClient(process.env.SLACK_TOKEN);

function recognize(image) {
     const visual_recognition = new VisualRecognitionV3({
         api_key: process.env.WATSON_KEY,
         version_date: VisualRecognitionV3.VERSION_DATE_2016_05_20
     });

     const params = {
         image_file: fs.createReadStream(image)
     };

     return new Promise((resolve, reject) => {
             visual_recognition.classify(params, function(err, res) {
             if (err) {
                 reject(err);
             } else {
                 resolve(res);
             }
         });
     });
 }

function translate(text){
    var language_translator = new LanguageTranslatorV2({
        username: process.env.TRANSLATOR_USER_NAME,
        password: process.env.TRANSLATOR_PASSWORD,
        url: 'https://gateway.watsonplatform.net/language-translator/api'
    });

    return new Promise((resolve,reject) => {
        language_translator.translate({
                text: text, source : 'en', target: 'de' },
            function (err, translation) {
                if (err) {
                    console.log('error:', err);
                    reject(err);
                }
                else {
                    console.log(JSON.stringify(translation, null, 2));
                    resolve(translation);
                }
            });
    });
}

rtm.on(RTM_EVENTS.MESSAGE, (message) => {
 if (!message.text ) { return }
 if (message.user === rtm.activeUserId) { return }

 const permalink = message.text.replace('<', '').replace('>', '');

 if (permalink.match(/^http/) && permalink.match(/\.(png|gif|jpg|jpeg)$/)) {
 const filename = "/tmp/" + Math.random().toString(36) + path.extname(permalink);
     request({
         uri: permalink
     }).pipe(fs.createWriteStream(filename)).on('close', () => {
         recognize(filename)
         .then((response) => {
             const [primaryClass, ...secondaryClasses] = response.images[0].classifiers[0].classes;
             const fields = secondaryClasses.map((aClass) => {
                 return {
                     short: true,
                     title: aClass['class'],
                     value: `${Math.round(aClass.score * 100)}%`
                 };
             });
             const slackResponse = {
                 as_user: true,
                 attachments: [
                     {
                         color: "#466BB0",
                         title: `Looks like you posted an image with a ${primaryClass['class']} in it.`,
                         text: "Other things I see:",
                         fields: fields
                     }
                 ]
             };
             web.chat.postMessage(message.channel, '', slackResponse, (err) => {
                 console.log(err);
             });
         })
         .catch((err) => {
             console.log(err);
         });
     });
 }
 //in this case we will translate the sentence to german
 else{
    translate(message.text).then(function(translatedText){
        const slackResponse = {
            as_user: true,
            attachments: [
                {
                    color: "#466BB0",
                    title: `Translate to german.`,
                    text: translatedText.translations[0].translation
                }
            ]
        };
        web.chat.postMessage(message.channel, '', slackResponse, (err) => {
            console.log(err);
        });
    })
 }
});

rtm.start();