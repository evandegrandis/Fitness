import WidgetKit
import SwiftUI

/// Entry point for the widget extension. Only the Live Activity widget is
/// registered — we're not shipping home-screen widgets yet. Adding more later
/// means appending them to this bundle.
@main
struct JeeraWidgetsBundle: WidgetBundle {
    var body: some Widget {
        WorkoutLiveActivity()
    }
}
