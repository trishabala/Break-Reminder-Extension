import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class BreakReminderPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'dialog-information-symbolic',
        });
        window.add(page);

        const group = new Adw.PreferencesGroup({
            title: _('Break Settings'),
            description: _('Configure how often you want to be reminded to take a break.'),
        });
        page.add(group);

        const intervalRow = new Adw.SpinRow({
            title: _('Reminder Interval'),
            subtitle: _('Minutes between movement break reminders'),
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 240,
                step_increment: 1,
                page_increment: 5,
            }),
        });

        settings.bind(
            'break-interval',
            intervalRow,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );

        group.add(intervalRow);
    }
}
