import Foundation

extension Date {
    var startOfWeek: Date {
        var cal = Calendar.current
        cal.firstWeekday = 2 // Monday
        return cal.dateInterval(of: .weekOfYear, for: self)?.start ?? self
    }

    var endOfWeek: Date {
        Calendar.current.date(byAdding: .day, value: 7, to: startOfWeek) ?? self
    }

    var startOfDay: Date {
        Calendar.current.startOfDay(for: self)
    }

    var isToday: Bool {
        Calendar.current.isDateInToday(self)
    }

    var isThisWeek: Bool {
        Calendar.current.isDate(self, equalTo: Date(), toGranularity: .weekOfYear)
    }

    var shortDate: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "d MMM"
        formatter.locale = Locale(identifier: "fr_FR")
        return formatter.string(from: self)
    }

    var shortTime: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: self)
    }

    var weekLabel: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "d MMM"
        formatter.locale = Locale(identifier: "fr_FR")
        return formatter.string(from: self)
    }

    var dayOfWeek: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEE"
        formatter.locale = Locale(identifier: "fr_FR")
        return formatter.string(from: self)
    }

    var relativeDay: String {
        if Calendar.current.isDateInToday(self) { return "Aujourd'hui" }
        if Calendar.current.isDateInYesterday(self) { return "Hier" }
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE d MMM"
        formatter.locale = Locale(identifier: "fr_FR")
        return formatter.string(from: self).capitalized
    }

    /// Monday=1 ... Sunday=7 (ISO)
    var isoDayOfWeek: Int {
        let dow = Calendar.current.component(.weekday, from: self)
        return dow == 1 ? 7 : dow - 1
    }

    // MARK: - French Greeting

    static func frenchGreeting(for name: String) -> String {
        let tz = TimeZone(identifier: "Europe/Paris") ?? .current
        var cal = Calendar.current
        cal.timeZone = tz
        let hour = cal.component(.hour, from: Date())
        if hour >= 18 {
            return "Bonsoir \(name)"
        } else {
            return "Bonjour \(name)"
        }
    }
}
