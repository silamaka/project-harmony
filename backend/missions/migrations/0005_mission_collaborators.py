from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('missions', '0004_mission_start_date'),
    ]

    operations = [
        migrations.AddField(
            model_name='mission',
            name='collaborators',
            field=models.ManyToManyField(
                blank=True, related_name='collaborating_missions', to=settings.AUTH_USER_MODEL
            ),
        ),
    ]
