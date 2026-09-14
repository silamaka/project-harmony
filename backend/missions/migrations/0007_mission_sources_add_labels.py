from django.db import migrations


def add_labels(apps, schema_editor):
    Mission = apps.get_model("missions", "Mission")
    for mission in Mission.objects.exclude(sources=[]):
        if any(not isinstance(s, dict) for s in mission.sources):
            mission.sources = [
                s if isinstance(s, dict) else {"label": "", "url": s} for s in mission.sources
            ]
            mission.save(update_fields=["sources"])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("missions", "0006_mission_sources"),
    ]

    operations = [
        migrations.RunPython(add_labels, noop),
    ]
