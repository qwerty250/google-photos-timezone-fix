// ==UserScript==
// @name         google-photos-tz-fix-mod
// @namespace    https://github.com/grubyak/
// @version      0.1
// @description  Fixes Date/Time/TZ of a photos in given Google Photos album, modified for Chinese users
// @license      MIT
// @author       grubyak
// @match        https://photos.google.com/*
// @require      https://code.jquery.com/jquery-3.2.1.js
// @updateURL    https://raw.githubusercontent.com/grubyak/google-photos-timezone-fix/master/google-photos-tz-fix.js
// @downloadURL  https://raw.githubusercontent.com/grubyak/google-photos-timezone-fix/master/google-photos-tz-fix.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    var EXPECTED_TZ = 'GMT+08:00';
    var nextPhotoTimeout = 20 * 1000;
    var updateTimeout = 8 * 1000;
    var savingTimeout = 10 * 1000;
    var dialogTimeout = 10 * 1000;

    var FILENAME_PATTERN = new RegExp(/^[0-9]{8}-[0-9]{6}-/);
    var FIELD_TZ = '[data-value][aria-hidden!="true"]';
    var FIELD_HOUR = 'input[aria-label="小时"]';
    var FIELD_MINUTES = 'input[aria-label="分钟"]';
    var FIELD_AMPM = 'input[aria-label="上午/下午"]';
    var FIELD_YEAR = 'input[aria-label="年"]';
    var FIELD_MONTH = 'input[aria-label="月"]';
    var FIELD_DAY = 'input[aria-label="日"]';
    var FIELD_FILENAME = 'div[aria-label*="文件名："]:visible';

    var BUTTON_DATE = 'div[aria-label*="日期："]:visible';
    var BUTTON_TIME = 'span[aria-label*="时间："]:visible:first';   // 后面另有曝光时间
    var BUTTON_TZ = 'span[aria-label*="GMT"]:visible';
    var BUTTON_CANCEL = '[role="dialog"]:visible button:visible:contains("取消")';
    var BUTTON_SAVE = 'button:visible:contains("保存")';

    var NOTIFICATION_DATE_CHANGED = ':contains("日期已更改"):visible:last';

    var timePattern = /\d+[\:]+\d{1,2}/
    var monthPattern = /\d{1,2}(?=[月])/
    var dayPattern = /\d{1,2}(?=[日])/

    var EDIT_DATE_AND_TIME = ':contains("修改日期和时间"):last';
    var VIEW_NEXT = '[aria-label="查看下一张照片"]:visible';

    function notify(type, msg) {
        console.log('[' + type + ']', msg);
    }

    function rand(from, plus) {
        return from + Math.floor(Math.random() * plus);
    }

    function waitFor(deadline, task, condition) {
        if (new Date().getTime() > deadline) {
            task.reject();
            return;
        }

        if (condition()) {
            setTimeout(task.resolve, rand(200, 150));
        } else {
            notify(' ', 'waiting...');
            requestAnimationFrame(waitFor.bind(null, deadline, task, condition));
        }
    }

    function openDialog() {
        var task = $.Deferred();
        var button = $(BUTTON_DATE);

        if (button.length) {
            notify('+', 'opening edit dialog');
            setTimeout(function() { button.click(); }, rand(500, 150));

            var previousOffsets = [];
            var compareLast = 5;

            waitFor(new Date().getTime() + dialogTimeout, task, function() {
                var dialog = $('[role="dialog"]:visible');
                var fields = [ FIELD_HOUR, FIELD_MINUTES, FIELD_AMPM, FIELD_YEAR, FIELD_MONTH, FIELD_DAY ];
                var fieldsPopulated = fields.every(item => !!dialog.find(item).val());
                var tzPopulated = !!$(dialog).find(FIELD_TZ).attr('aria-label');
                var offset = dialog.offset();
                var fullyVisible = false;

                if (offset) {
                    previousOffsets.push(offset.top + ' ' + offset.left);

                    if (previousOffsets.length === compareLast) {
                        var needle = previousOffsets.shift();

                        fullyVisible = previousOffsets.filter(x => x === needle).length === (compareLast - 1);
                    }
                }

                return fieldsPopulated && tzPopulated && fullyVisible;
            });
        } else {
            notify('-', 'edit option not available');
            task.reject();
        }

        return task;
    }

    function applyChanges(task, changes, saveButton, needToSave) {
        var requestedUpdate = changes.shift();

        needToSave = needToSave || false;

        if (typeof requestedUpdate === 'undefined') {
            if (needToSave) {
                var progress = '';

                waitFor(new Date().getTime() + savingTimeout, task, function() {
                    var notification = $(NOTIFICATION_DATE_CHANGED);
                    var position = notification.position() || { top: -1 };
                    var state = (position.top > 0) ? '1' : '0';

                    progress += (progress.slice(-1) === state) ? '' : state;

                    return (progress === '010');
                });

                notify('+', 'some fields got updated, saving changes');
                setTimeout(function() { saveButton.click(); }, rand(500, 150));
            } else {
                var cancelButton = $(BUTTON_CANCEL);
                notify('+', 'closing dialog without saving - details are correct');

                setTimeout(function() { cancelButton.click(); }, rand(500, 150));

                waitFor(new Date().getTime() + dialogTimeout, task, function() {
                    return $('[role="dialog"]:visible').length === 0;
                });
            }
        } else {
            var updater = $.Deferred();
            var dialog = $('[role="dialog"]');
            var caption = dialog.find(EDIT_DATE_AND_TIME).text();

            var watchedFields = [ FIELD_YEAR, FIELD_MONTH, FIELD_DAY, FIELD_HOUR, FIELD_MINUTES, FIELD_AMPM ];
            var fieldDump = y => y.map(x => dialog.find(x).val()).join('');
            var previousValues = fieldDump(watchedFields);
            var needToUpdate = false;

            notify('+', 'processing ' + requestedUpdate.description + ' - ' + requestedUpdate.value);

            if (requestedUpdate.action && !requestedUpdate.verify()) {
                needToUpdate = true;
                notify(' ', 'updating');
                setTimeout(requestedUpdate.action, rand(1000, 500));
            } else {
                var field = dialog.find(requestedUpdate.field);
                var value = requestedUpdate.value;

                if (field.length && (field.val() !== value)) {
                    needToUpdate = true;
                    notify(' ', 'updating');

                    field.val(value);

                    var refresh = $('[role="dialog"]').find(FIELD_AMPM);
                    refresh.click();
                    refresh.click();
                }
            }

            if (needToUpdate) {
                needToSave = true;

                waitFor(new Date().getTime() + updateTimeout, updater, function() {
                    var valueUpdated;
                    var formUpdated = previousValues !== fieldDump(watchedFields);
                    var captionUpdated = caption !== dialog.find(EDIT_DATE_AND_TIME).text();

                    if (requestedUpdate.action) {
                        valueUpdated = requestedUpdate.verify();
                    } else {
                        valueUpdated = dialog.find(requestedUpdate.field).val() === requestedUpdate.value;
                    }

                    return valueUpdated && formUpdated && captionUpdated;
                });
            } else {
                updater.resolve();
            }

            updater
                .fail(function() {
                    notify('-', 'looks like requested value was not set');
                    task.reject();
                })
                .done(function() {
                    applyChanges(task, changes, saveButton, needToSave);
                });
        }
    }

    function performUpdate(task) {
        var details = getPhotoDetails();

        notify('+', 'working on photo: ' + details.filename);

        openDialog()
            .fail(function() {
                notify('-', 'unable to open edit dialog');
                task.reject();
            })
            .done(function() {
                var dialog = $('[role="dialog"]');
                var saveButton = $(dialog).find(BUTTON_SAVE);
//DEBUG
                alert(saveButton);
                alert(dialog);

                var changes = [
                    {
                        description: 'timezone',
                        action: function() {
                            var updater = $.Deferred();

                            $(dialog).find(FIELD_TZ).closest('[role="presentation"]').click();

                            waitFor(new Date().getTime() + updateTimeout, updater, function() {
                                return $(dialog).find(FIELD_TZ).length > 1;
                            });

                            updater
                                .fail(function() {
                                    notify('-', 'timezone list box not available');
                                })
                                .done(function() {
                                    setTimeout(function() {
                                        $(dialog).find(FIELD_TZ).filter(':contains("' + EXPECTED_TZ + '")').last().click();
                                    }, rand(800, 500));
                                });
                        },
                        verify: function() {
                            return ($(dialog).find(FIELD_TZ).filter('[aria-selected="true"]').attr('aria-label') || '').indexOf(EXPECTED_TZ) !== -1;
                        },
                        value: EXPECTED_TZ
                    },
                    {
                        description: 'hour',
                        field: FIELD_HOUR,
                        value: details.hour
                    },
                    {
                        description: 'minutes',
                        field: FIELD_MINUTES,
                        value: details.minutes
                    },
                    {
                        description: 'am/pm',
                        field: FIELD_AMPM,
                        value: details.timeAmPm
                    },
                    {
                        description: 'year',
                        field: FIELD_YEAR,
                        value: details.year
                    },
                    {
                        description: 'month',
                        field: FIELD_MONTH,
                        value: details.month
                    },
                    {
                        description: 'day',
                        field: FIELD_DAY,
                        value: details.day
                    }
                ];

                notify('+', 'editing photo details');
                applyChanges(task, changes, saveButton);
            });
    }

    function fixCurrentPhoto() {
        var task = $.Deferred();
        var details = getPhotoDetails();

        if (details) {
            if (details.skip) {
                notify('-', 'skipping current photo (' + details.reason + ')');
                task.resolve();
            } else {
                performUpdate(task);
            }
        } else {
            notify('-', 'unable to find photo details');
            task.reject();
        }

        return task;
    }

    function getPhotoDetails() {
        var fileInfo = $(FIELD_FILENAME).text();
        var details = null;
        var timeInfo = $(BUTTON_TIME).text();
        var dateInfo = $(BUTTON_DATE).text();
        var tz = $(BUTTON_TZ).text();
        if(tz==EXPECTED_TZ) {
            return {
                filename: fileInfo,
                skip: true,
                reason: 'already set to ' + EXPECTED_TZ
            };
        }

        if (fileInfo.length) {
            var timeStr = timeInfo.match(timePattern)+''

            details = {};
            details.filename = fileInfo;
            if(dateInfo.search("年")==-1){
                details.year = (new Date).getFullYear();
            }
            else{
                details.year = dateInfo.substr(0, 4);
            }
            details.month = dateInfo.match(monthPattern) + '';
            details.day = dateInfo.match(dayPattern) + '';

            details.hour = ('0' + timeStr.split(':')[0]).slice(-2);
            details.minutes = timeStr.split(':')[1];
            details.timeAmPm = timeInfo.search("上午")==-1?"下午":"上午";
        }
/*
        var hour12h = Number(details.hour);
        if (hour12h < 12) {
            if (hour12h === 0) {
                hour12h = 12;
            }
                details.timeAmPm = 'AM';
            } else {
                if (hour12h > 12) {
                    hour12h -= 12;
                }
                details.timeAmPm = 'PM';
            }
*/
            //details.hour = ('0' + hour12h).slice(-2);
            details.everything = JSON.stringify(details);
        

        return details;
    }

    function requestNextPhoto() {
        var task = $.Deferred();
        var previous = getPhotoDetails();
        var button = $(VIEW_NEXT);

        if (button.length) {
            setTimeout(function() { button.click(); }, rand(500, 150));

            waitFor(new Date().getTime() + nextPhotoTimeout, task, function() {
                var current = getPhotoDetails();

                return previous && current && (previous.filename !== current.filename);
            });
        } else {
            task.reject();
        }

        return task;
    }

    function traverseAlbum(task) {
        fixCurrentPhoto()
            .fail(function() {
                notify('-', 'unable to fix current photo, stopping');
                task.reject();
            })
            .done(function() {
                notify('+', 'requesting next photo');

                requestNextPhoto()
                    .fail(function() {
                        notify(' ', 'reached end of the album');
                        task.resolve();
                     })
                    .done(traverseAlbum.bind(null, task));
            });
    }

    window.fixAlbum = function() {
        var task = $.Deferred();

        traverseAlbum(task);

        task
            .fail(notify.bind(null, '-', 'not all photos fixed'))
            .done(notify.bind(null, '+', 'everything is done :)'));
    };

})();