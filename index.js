const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');
 
const app = express();
const port = 3000;

mongoose.connect('mongodb://127.0.0.1:27017/schoolApp', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

app.use(express.json());

// MongoDB Schema and Models
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  photo: String,
  parentInviteCode: String,
  teacherInviteCode: String,
  role: String,
});

const schoolSchema = new mongoose.Schema({
  name: String,
  photo: String,
});

const classSchema = new mongoose.Schema({
  name: String,
  students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
});

const studentSchema = new mongoose.Schema({
  name: String,
  photo: String,
  classes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Class' }],
});

const User = mongoose.model('User', userSchema);
const School = mongoose.model('School', schoolSchema);
const Class = mongoose.model('Class', classSchema);
const Student = mongoose.model('Student', studentSchema);

// Middlewares
app.use(bodyParser.json());

const authenticateUser = (req, res, next) => {
  const token = req.header('Authorization');
  console.log('Received token:', token);

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const decoded = jwt.verify(token, process.env.SECRET_KEY || 'default_secret_key');
    req.user = decoded.user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

const upload = multer({ dest: 'uploads/' });

// API Routes
app.post('/api/signup', upload.single('photo'), async (req, res) => {
  try {
    const { name, email, password, parentInviteCode, teacherInviteCode } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      name,
      email,
      password: hashedPassword,
      parentInviteCode,
      teacherInviteCode,
      role: 'student',
      photo: req.file ? req.file.path : null,
    });

    await user.save();

    res.json({ message: 'User created successfully', user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ user: { id: user._id } }, 'secret_key');

    res.json({ message: 'Login successful', user: { ...user.toObject(), password: undefined }, token });
    console.log(token);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});


// API to create a school
app.post('/schools', async (req, res) => {
    try {
      const { name, photo } = req.body;
  
      // Create a new school
      const school = new School({ name, photo });
      const result = await school.save();
  
      res.json(result);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });
  
 // API to get schools based on user's role
app.get('/my-schools', authenticateUser, async (req, res) => {
    try {
      const userId = req.user && req.user.id;
  
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
  
      const user = await User.findById(userId);
  
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
  
      let schools;
  
      if (user.role === 'student' || user.role === 'teacher') {
        // If the user is a student or teacher, find schools based on user's classes
        schools = await School.find({ '_id': { $in: user.classes } });
      } else {
        // For other roles, return all schools
        schools = await School.find();
      }
  
      res.json({ schools });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });
  

 // API to create a class
app.post('/classes', authenticateUser, async (req, res) => {
    try {
      const { name } = req.body;
  
      // Create a new class with only the 'Name' field
      const newClass = new Class({ name });
      const result = await newClass.save();
  
      res.json(result);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });
  
  // API to get class by ID
  app.get('/classes/:classId', authenticateUser, async (req, res) => {
    try {
      const classId = req.params.classId;
  
      // Check if the provided classId is a valid ObjectId
      if (!mongoose.Types.ObjectId.isValid(classId)) {
        return res.status(400).json({ message: 'Invalid class ID' });
      }
  
      // Find the class by ID
      const foundClass = await Class.findById(classId);
  
      // Check if the class exists
      if (!foundClass) {
        return res.status(404).json({ message: 'Class not found' });
      }
  
      res.json(foundClass);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // API to create a student
app.post('/students', authenticateUser, upload.single('photo'), async (req, res) => {
    try {
      const { name } = req.body;
  
      // Create a new student
      const newStudent = new Student({
        name,
        photo: req.file ? req.file.path : null,
      });
  
      const result = await newStudent.save();
  
      res.json(result);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // API to get all students
app.get('/students', authenticateUser, async (req, res) => {
    try {
      // Find all students in the database
      const students = await Student.find();
  
      res.json(students);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // API to assign a student to a class
app.post('/assign-student-to-class', authenticateUser, async (req, res) => {
    try {
      const { class_id, student_id } = req.body;
  
      // Check if the provided class_id and student_id are valid ObjectId
      if (!mongoose.Types.ObjectId.isValid(class_id) || !mongoose.Types.ObjectId.isValid(student_id)) {
        return res.status(400).json({ message: 'Invalid class or student ID' });
      }
  
      // Check if the class and student exist
      const foundClass = await Class.findById(class_id);
      const foundStudent = await Student.findById(student_id);
  
      if (!foundClass || !foundStudent) {
        return res.status(404).json({ message: 'Class or student not found' });
      }
  
      // Assign the student to the class
      foundClass.students.push(foundStudent._id);
      await foundClass.save();
  
      // Update the student's classes
      foundStudent.classes.push(foundClass._id);
      await foundStudent.save();
  
      res.json({ message: 'Student assigned to class successfully' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // API to get students in all created classes
app.get('/students-in-all-classes', authenticateUser, async (req, res) => {
    try {
      // Find all created classes
      const allClasses = await Class.find();
  
      // If there are no classes, return an empty array
      if (!allClasses || allClasses.length === 0) {
        return res.json([]);
      }
  
      // Get the students who are part of all classes
      const studentsInAllClasses = await Student.find({
        classes: { $all: allClasses.map(cls => cls._id) }
      });
  
      res.json(studentsInAllClasses);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // API to get classmates of a specific student
app.get('/classmates/:studentId', authenticateUser, async (req, res) => {
    try {
      const studentId = req.params.studentId;
  
      // Check if the provided studentId is a valid ObjectId
      if (!mongoose.Types.ObjectId.isValid(studentId)) {
        return res.status(400).json({ message: 'Invalid student ID' });
      }
  
      // Find the specified student
      const targetStudent = await Student.findById(studentId);
  
      // Check if the student exists
      if (!targetStudent) {
        return res.status(404).json({ message: 'Student not found' });
      }
  
      // Get the classes of the target student
      const studentClasses = targetStudent.classes;
  
      // Find classmates who share the same classes
      const classmates = await Student.find({
        _id: { $ne: targetStudent._id }, // Exclude the target student
        classes: { $in: studentClasses }
      });
  
      res.json(classmates);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });
  
   
// Start the server
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});





