from django.db import migrations, models


def backfill_start_date(apps, schema_editor):
    Mission = apps.get_model("missions", "Mission")
    for mission in Mission.objects.all():
        mission.start_date = mission.created_at.date()
        mission.save(update_fields=["start_date"])


class Migration(migrations.Migration):

    dependencies = [
        ('missions', '0003_remove_mission_objective_remove_mission_resources_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='mission',
            name='start_date',
            field=models.DateField(null=True),
        ),
        migrations.RunPython(backfill_start_date, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='mission',
            name='start_date',
            field=models.DateField(),
        ),
    ]
