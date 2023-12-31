const Health = require("../models/health");
const User = require("../models/user");

module.exports = {
  index,
  show,
  new: newHealth,
  create,
  delete: deleteHealth,
  update,
  edit
};

async function update(req, res) {
  try {
    await Health.findOneAndUpdate(
      { _id: req.params.id }, 
      req.body
    );
    res.redirect(`/health/${req.params.id}`);
  } catch (err) {
    console.error(err);
    res.redirect('/dashboard');
  }
}

async function edit(req, res) {
  let healthOne = await Health.findById(req.params.id);
  res.render('health/edit', {
    healthOne
  })
}

async function deleteHealth(req, res) {
  try {
    const healthOne = await Health.findById(req.params.id);
    if (!healthOne) return res.redirect('/dashboard');

    await healthOne.deleteOne();
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.redirect('/dashboard');
  }
}

async function index(req, res) {
  let health = await Health.find({ user: req.user._id });
  res.render("health/index", { health });
}

async function show(req, res) {
  const healthOne = await Health.findById(req.params.id);
  res.render("health/show", { healthOne });
}

function newHealth(req, res) {
  res.render("health/new");
}

async function create(req, res) {
  try {
    const source = req.body.source;

    // Fitbit form submitted
    if (source === "fitbit") {
      if (!req.isAuthenticated()) {
        return res.status(401).send("User not authenticated. Please try again.");
      }

      if (!req.user.accessToken) {
        let user = await User.findOne({ _id: req.user._id });
        let tokens = tokenRefresh(req.user.refreshToken, req, res);
        user.accessToken = tokens.accessToken;
        user.refreshToken = tokens.refreshToken;
        await user.save();
        accessToken = user.accessToken;
      }

      let accessToken = req.user.accessToken;
      let fitbitDate = req.body.date;
      let responseActivities = await fetch(
        `https://api.fitbit.com/1/user/-/activities/date/${fitbitDate}.json`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      // If access token expired, obtain new access token
      if (!responseActivities.ok) {
        let user = await User.findOne({ _id: req.user._id });
        let tokens = tokenRefresh(req.user.refreshToken);
        user.accessToken = tokens.accessToken;
        user.refreshToken = tokens.refreshToken;
        await user.save();
        accessToken = user.accessToken;
      }

      responseActivities = await fetch(
        `https://api.fitbit.com/1/user/-/activities/date/${fitbitDate}.json`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
      
      let responseSleep = await fetch(
        `https://api.fitbit.com/1.2/user/-/sleep/date/${fitbitDate}.json`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      let responseWeight = await fetch(
        `https://api.fitbit.com/1/user/-/body/log/weight/date/${fitbitDate}.json`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      const activitiesData = await responseActivities.json();
      const sleepData = await responseSleep.json();
      const weightData = await responseWeight.json();

      const health = await Health.create(req.body);
      health.caloriesOut = activitiesData.summary.caloriesOut;
      health.restingHeartRate = activitiesData.summary.restingHeartRate;
      health.steps = activitiesData.summary.steps;
      health.sleep = (sleepData.summary.totalMinutesAsleep / 60).toFixed(2);
      health.weight = weightData.weight.weight;
      health.caloriesIn = 0
      await health.save();

      console.log("New health record created:", health);
      res.redirect(`/dashboard`);

    // Manual form submitted
    } else if (source === "manual") {
      
      // Set unfilled form properties to default 0 (e.g. sleep = 0 hrs)
      let properties = req.body;
      for (const key in properties) {
        if (!properties[key]) properties[key] = 0;
      }
      
      const health = await Health.create(req.body);

      console.log("New health record created:", health);
      res.redirect(`/dashboard`);
    } else {
      return res.status(400).send("Invalid form submission");
    }
  } catch (err) {
    console.log(err);
    res.redirect('/dashboard');
  }
}

// Request new tokens from Fitbit
async function tokenRefresh(refreshToken, req, res) {
  try {
    const tokenUrl = 'https://api.fitbit.com/oauth2/token';
    const clientId = process.env.FITBIT_CLIENT_ID;
    const clientSecret = process.env.FITBIT_CLIENT_SECRET;

    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refreshToken);

    const headers = {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    };

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...headers,
      },
      body: params,
    });

    if (!response.ok) {
      throw new Error('Failed to refresh token.');
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
    };
  } catch (err) {
    console.log(err);
  }
}